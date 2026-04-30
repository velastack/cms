import { describe, it, expect } from 'vitest';
import { apiAdapter } from './api-adapter.ts';
import type { CmsScopeQuery } from './types.ts';

type FetchCall = { url: string; init?: RequestInit };

const stubFetch = (
	respond: (url: string) => { status: number; json?: unknown }
): { fetch: typeof fetch; calls: FetchCall[] } => {
	const calls: FetchCall[] = [];
	const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input.toString();
		calls.push({ url, init });
		const result = respond(url);
		return new Response(result.json !== undefined ? JSON.stringify(result.json) : null, {
			status: result.status,
			headers: result.json !== undefined ? { 'content-type': 'application/json' } : undefined
		});
	}) as typeof fetch;
	return { fetch: fakeFetch, calls };
};

const layoutQuery = (scopeId: string, routeId: string): CmsScopeQuery => ({
	scopeId,
	kind: 'layout',
	routeId,
	params: {},
	fields: [],
	locale: 'en'
});

const pageQuery = (
	scopeId: string,
	routeId: string,
	params: Record<string, string>
): CmsScopeQuery => ({
	scopeId,
	kind: 'page',
	routeId,
	params,
	fields: [],
	locale: 'en'
});

describe('apiAdapter — endpoint', () => {
	it('exposes the configured endpoint', () => {
		const adapter = apiAdapter({ endpoint: 'http://localhost:5174/v1/projects/p1/cms' });
		expect(adapter.endpoint).toBe('http://localhost:5174/v1/projects/p1/cms');
	});

	it('strips a trailing slash from the endpoint', () => {
		const adapter = apiAdapter({ endpoint: 'http://localhost:5174/v1/projects/p1/cms/' });
		expect(adapter.endpoint).toBe('http://localhost:5174/v1/projects/p1/cms');
	});
});

describe('apiAdapter — fetchDocs', () => {
	it('issues one GET /docs per scope query and keys the result by scopeId', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch((url) => {
			if (url.includes('scopeA')) return { status: 200, json: { contents: { a: 1 } } };
			if (url.includes('scopeB')) return { status: 200, json: { contents: { b: 2 } } };
			// URL doesn't carry scopeId, so we infer by routeId in the query.
			if (url.includes(encodeURIComponent('/foo'))) {
				return { status: 200, json: { contents: { foo: true } } };
			}
			if (url.includes(encodeURIComponent('/bar'))) {
				return { status: 200, json: { contents: { bar: true } } };
			}
			return { status: 404 };
		});

		const result = await adapter.fetchDocs(
			[layoutQuery('layout:/foo', '/foo'), pageQuery('page:/bar', '/bar', { slug: 'x' })],
			{ fetch, previewKey: null }
		);

		expect(calls).toHaveLength(2);
		expect(result['layout:/foo']).toEqual({ contents: { foo: true } });
		expect(result['page:/bar']).toEqual({ contents: { bar: true } });
	});

	it('omits scopes that 404 from the result', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch } = stubFetch((url) => {
			if (url.includes(encodeURIComponent('/missing'))) return { status: 404 };
			return { status: 200, json: { contents: { ok: true } } };
		});

		const result = await adapter.fetchDocs(
			[layoutQuery('layout:/missing', '/missing'), layoutQuery('layout:/ok', '/ok')],
			{ fetch, previewKey: null }
		);

		expect(result['layout:/missing']).toBeUndefined();
		expect(result['layout:/ok']).toEqual({ contents: { ok: true } });
	});

	it('throws on non-2xx, non-404 responses', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch } = stubFetch(() => ({ status: 500 }));
		await expect(
			adapter.fetchDocs([layoutQuery('layout:/foo', '/foo')], { fetch, previewKey: null })
		).rejects.toThrow(/500/);
	});

	it('appends ?preview=… when a previewKey is provided', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({ status: 200, json: { contents: {} } }));
		await adapter.fetchDocs([layoutQuery('layout:/', '/')], {
			fetch,
			previewKey: 'abc 123'
		});
		expect(calls[0].url).toContain('preview=abc%20123');
	});

	it('does not append ?preview when previewKey is null', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({ status: 200, json: { contents: {} } }));
		await adapter.fetchDocs([layoutQuery('layout:/', '/')], { fetch, previewKey: null });
		expect(calls[0].url).not.toContain('preview=');
	});

	it('serializes page params as JSON in the params query string', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({ status: 200, json: { contents: {} } }));
		await adapter.fetchDocs([pageQuery('page:/r/[slug]', '/r/[slug]', { slug: 'a' })], {
			fetch,
			previewKey: null
		});
		expect(calls[0].url).toContain(`params=${encodeURIComponent(JSON.stringify({ slug: 'a' }))}`);
	});

	it('passes credentials: "include" so cookies travel cross-origin', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({ status: 200, json: { contents: {} } }));
		await adapter.fetchDocs([layoutQuery('layout:/', '/')], { fetch, previewKey: null });
		expect(calls[0].init?.credentials).toBe('include');
	});
});

describe('apiAdapter — fetchEntries', () => {
	it('returns published entries for the requested route, filtering drafts and pending deletes', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({
			status: 200,
			json: {
				routes: [
					{
						routeId: '/r/[slug]',
						entries: [
							{ params: { slug: 'a' }, metadata: { title: 'A' } },
							{ params: { slug: 'draft' }, isDraft: true, metadata: { title: 'D' } },
							{ params: { slug: 'gone' }, isDeletePending: true, metadata: {} },
							{ params: { slug: 'b' } }
						]
					},
					{ routeId: '/other', entries: [{ params: {}, metadata: {} }] }
				]
			}
		}));

		const entries = await adapter.fetchEntries('/r/[slug]', { fetch, previewKey: null });
		expect(calls[0].url).toBe('http://api/cms/pages');
		expect(entries).toEqual([
			{ params: { slug: 'a' }, metadata: { title: 'A' } },
			{ params: { slug: 'b' }, metadata: {} }
		]);
	});

	it('returns [] when the route is not in the response', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch } = stubFetch(() => ({ status: 200, json: { routes: [] } }));
		const entries = await adapter.fetchEntries('/r/[slug]', { fetch, previewKey: null });
		expect(entries).toEqual([]);
	});

	it('throws on non-2xx response', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch } = stubFetch(() => ({ status: 500 }));
		await expect(adapter.fetchEntries('/r/[slug]', { fetch, previewKey: null })).rejects.toThrow(
			/500/
		);
	});

	it('passes credentials: "include" so cookies travel cross-origin', async () => {
		const adapter = apiAdapter({ endpoint: 'http://api/cms' });
		const { fetch, calls } = stubFetch(() => ({ status: 200, json: { routes: [] } }));
		await adapter.fetchEntries('/r/[slug]', { fetch, previewKey: null });
		expect(calls[0].init?.credentials).toBe('include');
	});
});
