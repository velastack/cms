import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import * as z from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createCmsBackend } from '../backend/factory.js';
import { readContent } from '../backend/content.js';
import { createCmsMcp, requireScopes, type CmsMcpOptions, type CmsMcpPrincipal } from './index.js';

const ORIGIN = 'https://cms.test';
const ENDPOINT = `${ORIGIN}/mcp`;

const backend = createCmsBackend({
	dbPath: ':memory:',
	uploadDir: mkdtempSync(join(tmpdir(), 'vela-mcp-'))
});
afterAll(() => backend.close());

const ana = { id: 'user_ana', email: 'ana@example.com', name: 'Ana' };

/** What each bearer token stands for; anything else is not a token. */
const tokens: Record<string, CmsMcpPrincipal> = {};
const principal = (over: Partial<CmsMcpPrincipal> = {}): CmsMcpPrincipal => ({
	editor: ana,
	scopes: ['content:read', 'content:write'],
	clientId: 'client-1',
	expiresAt: Math.floor(Date.now() / 1000) + 3600,
	resource: ENDPOINT,
	...over
});

let project = '';
let other = '';
let n = 0;
const afterPublish = vi.fn(async () => 'The website is being rebuilt.');

const seed = (id: string, name: string) =>
	backend.store.seed(id, {
		site: { phone: '+502 5555 0000' },
		layouts: { en: { '/': { branding: { name } } }, es: { '/': { branding: { name } } } },
		pages: {
			en: { '/menu': { title: 'Menu', lunch: { price: 45 } } },
			es: { '/menu': { title: 'Menú', lunch: { price: 45 } } }
		}
	});

beforeEach(() => {
	project = `p${++n}`;
	other = `other${n}`;
	seed(project, 'La Fonda');
	seed(other, 'Someone Else');
	afterPublish.mockClear();
	for (const key of Object.keys(tokens)) delete tokens[key];
	tokens.good = principal();
});

const options = (over: Partial<CmsMcpOptions> = {}): CmsMcpOptions => ({
	backend,
	verifyToken: async (token) => tokens[token] ?? null,
	sites: () => [{ id: project, name: 'La Fonda', url: 'https://lafonda.example' }],
	afterPublish,
	...over
});

/** Hands a web Request to a SvelteKit handler, as the router would. */
const serve =
	(handler: (event: RequestEvent) => Response | Promise<Response>) =>
	async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		return handler({ request, url: new URL(request.url) } as unknown as RequestEvent);
	};

const connect = async (token: string, over: Partial<CmsMcpOptions> = {}) => {
	const mcp = createCmsMcp(options(over));
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(ENDPOINT), {
			fetch: serve(mcp.handler),
			requestInit: { headers: { Authorization: `Bearer ${token}` } }
		})
	);
	return client;
};

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
	const result = await client.callTool({ name, arguments: args });
	const [first] = result.content as { type: string; text: string }[];
	return { data: JSON.parse(first.text), isError: result.isError === true };
};

const post = (mcp: ReturnType<typeof createCmsMcp>, headers: Record<string, string> = {}) =>
	serve(mcp.handler)(ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...headers
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
	});

describe('authorization', () => {
	it('challenges a request without a token, pointing at the metadata', async () => {
		const res = await post(createCmsMcp(options()));
		expect(res.status).toBe(401);
		const challenge = res.headers.get('www-authenticate') ?? '';
		expect(challenge).toContain('Bearer');
		expect(challenge).toContain(
			`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
		);
		// a client told no scope asks for everything the metadata lists
		expect(challenge).not.toContain('scope=');
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		expect(res.headers.get('access-control-expose-headers')).toContain('www-authenticate');
	});

	it('refuses an unknown token', async () => {
		const res = await post(createCmsMcp(options()), { authorization: 'Bearer nope' });
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain('invalid_token');
	});

	it('refuses a token issued for another server, or for none', async () => {
		tokens.elsewhere = principal({ resource: 'https://other.test/mcp' });
		tokens.unbound = principal({ resource: null });
		const mcp = createCmsMcp(options());
		for (const token of ['elsewhere', 'unbound']) {
			const res = await post(mcp, { authorization: `Bearer ${token}` });
			expect(res.status, token).toBe(401);
		}
	});

	it('refuses an expired token', async () => {
		tokens.old = principal({ expiresAt: Math.floor(Date.now() / 1000) - 10 });
		const res = await post(createCmsMcp(options()), { authorization: 'Bearer old' });
		expect(res.status).toBe(401);
	});

	it('answers a preflight without a token', async () => {
		const res = await serve(createCmsMcp(options()).handler)(ENDPOINT, { method: 'OPTIONS' });
		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
	});

	it('serves the protected resource metadata', async () => {
		const mcp = createCmsMcp(options({ scopes: ['data:read'] }));
		const res = await serve(mcp.metadata)(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
		expect(await res.json()).toEqual({
			resource: ENDPOINT,
			authorization_servers: [ORIGIN],
			scopes_supported: ['content:read', 'content:write', 'data:read'],
			bearer_methods_supported: ['header'],
			resource_name: 'Website content'
		});
	});

	it('names another authorization server when the host has one', async () => {
		const mcp = createCmsMcp(options({ issuer: () => 'https://auth.example' }));
		const res = await serve(mcp.metadata)(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
		expect((await res.json()).authorization_servers).toEqual(['https://auth.example']);
	});
});

describe('tools', () => {
	it('lists the content tools, marking which ones only read', async () => {
		const client = await connect('good');
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			'discard_pending_changes',
			'list_pending_changes',
			'list_sites',
			'publish_changes',
			'read_content',
			'stage_changes'
		]);
		const readOnly = tools
			.filter((tool) => tool.annotations?.readOnlyHint)
			.map((tool) => tool.name);
		expect(readOnly.sort()).toEqual(['list_pending_changes', 'list_sites', 'read_content']);
	});

	it('reads, stages, and publishes only when told to', async () => {
		const client = await connect('good');

		const sites = await call(client, 'list_sites');
		expect(sites.data).toEqual([
			{
				id: project,
				name: 'La Fonda',
				url: 'https://lafonda.example',
				languages: expect.arrayContaining(['en', 'es']),
				pending_changes: 0
			}
		]);

		// one site, so it need not be named
		const read = await call(client, 'read_content', { language: 'en' });
		expect(read.data.documents.map((doc: { id: string }) => doc.id)).toEqual([
			'site',
			'layout:/',
			'page:/menu'
		]);

		const staged = await call(client, 'stage_changes', {
			changes: [
				{ language: 'en', document: 'page:/menu', path: 'lunch.price', value: 50 },
				{ language: 'es', document: 'page:/menu', path: 'lunch.price', value: 50 }
			]
		});
		expect(staged.isError).toBe(false);
		expect(staged.data.published).toBe(false);
		expect(staged.data.staged).toEqual([
			{ doc: 'page:/menu', locale: 'en', path: 'lunch.price', from: 45, to: 50 },
			{ doc: 'page:/menu', locale: 'es', path: 'lunch.price', from: 45, to: 50 }
		]);

		// nothing is live, but the assistant sees what it staged
		expect(
			readContent(backend.store, project, 'en').find((doc) => doc.id === 'page:/menu')!.tree
		).toMatchObject({ lunch: { price: 45 } });
		const again = await call(client, 'read_content', { documents: ['page:/menu'] });
		expect(again.data.documents).toEqual([
			{ id: 'page:/menu', content: { title: 'Menu', lunch: { price: 50 } } }
		]);
		expect(again.data.pending_changes).toBe(2);
		expect((await call(client, 'list_pending_changes')).data.changes).toHaveLength(2);
		expect(afterPublish).not.toHaveBeenCalled();

		const published = await call(client, 'publish_changes', { summary: 'New lunch price' });
		expect(published.data).toMatchObject({
			published: true,
			url: 'https://lafonda.example',
			note: 'The website is being rebuilt.'
		});
		expect(published.data.changes).toHaveLength(2);
		for (const locale of ['en', 'es']) {
			expect(
				readContent(backend.store, project, locale).find((doc) => doc.id === 'page:/menu')!.tree
			).toMatchObject({ lunch: { price: 50 } });
		}
		const [release] = backend.store.getReleaseHistory(project);
		expect(release.name).toBe('New lunch price');
		expect(release.publishedBy).toMatchObject({ id: 'user_ana', name: 'Ana' });
		expect(afterPublish).toHaveBeenCalledTimes(1);

		const empty = await call(client, 'publish_changes');
		expect(empty.isError).toBe(true);
	});

	it('stages nothing when a change is invalid, and says why', async () => {
		const client = await connect('good');
		const result = await call(client, 'stage_changes', {
			changes: [
				{ language: 'en', document: 'page:/menu', path: 'lunch.price', value: 50 },
				{ language: 'en', document: 'page:/menu', path: 'dessert', value: 'Flan' }
			]
		});
		expect(result.isError).toBe(true);
		expect(result.data.problem).toContain('has no field "dessert"');
		expect((await call(client, 'list_pending_changes')).data.changes).toEqual([]);
	});

	it('discards what was staged', async () => {
		const client = await connect('good');
		await call(client, 'stage_changes', {
			changes: [{ language: 'en', document: 'page:/menu', path: 'title', value: 'Lunch' }]
		});
		expect((await call(client, 'discard_pending_changes')).data.discarded).toBe(true);
		expect((await call(client, 'list_pending_changes')).data.changes).toEqual([]);
	});

	it("never touches a site that is not the person's", async () => {
		const client = await connect('good');
		for (const [name, args] of [
			['read_content', {}],
			['list_pending_changes', {}],
			[
				'stage_changes',
				{ changes: [{ language: 'en', document: 'page:/menu', path: 'title', value: 'Hacked' }] }
			],
			['discard_pending_changes', {}],
			['publish_changes', {}]
		] as const) {
			const result = await call(client, name, { ...args, site: other });
			expect(result.isError, name).toBe(true);
			expect(result.data.error, name).toContain('not one of their websites');
		}
		expect(backend.store.getOpenRelease(other, ana.id)).toBeNull();
	});

	it('asks which site when the person has several', async () => {
		const client = await connect('good', {
			sites: () => [
				{ id: project, name: 'La Fonda' },
				{ id: other, name: 'Second' }
			]
		});
		const result = await call(client, 'read_content');
		expect(result.isError).toBe(true);
		expect(result.data.error).toContain('several websites');
		expect((await call(client, 'read_content', { site: other })).isError).toBe(false);
	});

	it('reads but does not change a read-only site', async () => {
		const client = await connect('good', {
			sites: () => [{ id: project, name: 'La Fonda', readOnly: 'Editing is not turned on.' }]
		});
		expect((await call(client, 'read_content')).isError).toBe(false);
		const result = await call(client, 'stage_changes', {
			changes: [{ language: 'en', document: 'page:/menu', path: 'title', value: 'Lunch' }]
		});
		expect(result).toEqual({ data: { error: 'Editing is not turned on.' }, isError: true });
	});

	it('challenges for the write scope instead of changing anything', async () => {
		tokens.reader = principal({ scopes: ['content:read'] });
		const mcp = createCmsMcp(options());
		const fetchMcp = serve(mcp.handler);
		const statuses: number[] = [];
		const challenges: string[] = [];
		const client = new Client({ name: 'test-client', version: '1.0.0' });
		await client.connect(
			new StreamableHTTPClientTransport(new URL(ENDPOINT), {
				fetch: async (input, init) => {
					const res = await fetchMcp(input, init);
					statuses.push(res.status);
					if (res.status === 403) challenges.push(res.headers.get('www-authenticate') ?? '');
					return res;
				},
				requestInit: { headers: { Authorization: 'Bearer reader' } }
			})
		);

		expect((await call(client, 'read_content')).isError).toBe(false);
		await expect(
			call(client, 'stage_changes', {
				changes: [{ language: 'en', document: 'page:/menu', path: 'title', value: 'Lunch' }]
			})
		).rejects.toThrow();
		expect(challenges[0]).toContain('insufficient_scope');
		expect(challenges[0]).toContain('content:write');
		expect(backend.store.getOpenRelease(project, ana.id)).toBeNull();
	});

	it("serves the host's own tools next to the content tools", async () => {
		const client = await connect('good', {
			scopes: ['data:read'],
			extend: (server, { principal }) => {
				server.registerTool(
					'whoami',
					{
						description: 'Who is asking.',
						inputSchema: z.object({}),
						scopeChallenge: requireScopes('content:read')
					},
					async () => ({ content: [{ type: 'text', text: principal.editor.name }] })
				);
			}
		});
		const result = await client.callTool({ name: 'whoami', arguments: {} });
		expect(result.content).toEqual([{ type: 'text', text: 'Ana' }]);
	});
});
