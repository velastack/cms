import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from '../testing/harness.js';
import type { CmsAuthAdapter, CmsEditor } from '../types.js';

/**
 * Sign-in through an authorization server: the backend is the OAuth client,
 * and the editor ends up with the same session a password would give them.
 * The authorization server here is a stub answering what the backend fetches.
 */
const FAST = { N: 1024, r: 8, p: 1 };
const ISSUER = 'https://accounts.test';
const ORIGIN = 'https://cms.test';
const MOUNT = `${ORIGIN}/cms`;

const ana: CmsEditor = { id: 'user_ana', email: 'ana@example.com', name: 'Ana' };

/** What the stub authorization server was asked, and what it will say. */
let server: {
	supportsDocuments: boolean;
	registrations: Record<string, unknown>[];
	tokenRequests: URLSearchParams[];
	revoked: string[];
	identity: CmsEditor | null;
	metadataIssuer: string;
};
let mayEdit: (userId: string, projectId: string) => boolean;
let backend: CmsBackend;
let client: CmsTestClient;

const stubServer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (url.origin !== ISSUER) return new Response('unexpected', { status: 599 });
	const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
	switch (url.pathname) {
		case '/.well-known/oauth-authorization-server':
			return Response.json({
				issuer: server.metadataIssuer,
				authorization_endpoint: `${ISSUER}/authorize`,
				token_endpoint: `${ISSUER}/token`,
				registration_endpoint: `${ISSUER}/register`,
				revocation_endpoint: `${ISSUER}/revoke`,
				client_id_metadata_document_supported: server.supportsDocuments
			});
		case '/register':
			server.registrations.push(JSON.parse(String(init?.body)));
			return Response.json(
				{ client_id: `registered-${server.registrations.length}` },
				{ status: 201 }
			);
		case '/token':
			server.tokenRequests.push(body);
			if (body.get('code') !== 'good-code') {
				return Response.json({ error: 'invalid_grant' }, { status: 400 });
			}
			return Response.json({ access_token: 'at', refresh_token: 'rt', scope: 'site:edit' });
		case '/revoke':
			server.revoked.push(body.get('token') ?? '');
			return new Response(null, { status: 200 });
	}
	return new Response('not found', { status: 404 });
};

const makeBackend = (over: Partial<Parameters<typeof localEditors>[0] & object> = {}) => {
	const local = localEditors({
		scrypt: FAST,
		oauth: {
			label: 'Continue with Accounts',
			clientName: 'Site editor',
			scope: 'site:edit',
			issuer: () => ISSUER,
			identify: async (tokens, resource) =>
				tokens.accessToken === 'at' && resource === MOUNT ? server.identity : null
		},
		...over
	});
	const auth: CmsAuthAdapter = {
		...local,
		authorize: async (user, projectId, ctx) =>
			(await local.authorize(user, projectId, ctx)) || mayEdit(user.id, projectId)
	};
	return createCmsBackend({
		dbPath: ':memory:',
		auth,
		resolveProject: () => 'p1',
		frameAncestors: '*'
	});
};

beforeEach(async () => {
	server = {
		supportsDocuments: true,
		registrations: [],
		tokenRequests: [],
		revoked: [],
		identity: ana,
		metadataIssuer: ISSUER
	};
	mayEdit = (userId, projectId) => userId === 'user_ana' && projectId === 'p1';
	vi.stubGlobal('fetch', vi.fn(stubServer));
	vi.spyOn(console, 'error').mockImplementation(() => {});
	backend = makeBackend();
	await backend.editors.create({
		email: 'local@example.com',
		password: 'password',
		projects: ['p1']
	});
	client = createCmsTestClient(backend, { basePath: '/cms', origin: ORIGIN });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	backend.close();
});

/** Opens the popup: `start`, and where it sends the person. */
const start = async (as = client) => {
	const res = await as.get('/oauth/start');
	expect(res.status).toBe(302);
	return new URL(res.headers.get('location')!);
};

/** The one-time token the popup hands the login page. */
const handoffOf = (html: string) => /handoff: "([^"]+)"/.exec(html)?.[1] ?? null;

const handoffForm = (handoff: string) => {
	const form = new FormData();
	form.set('handoff', handoff);
	return form;
};

/** The whole sign-in, up to the popup's hand-off. */
const signIn = async (as = client) => {
	const authorize = await start(as);
	const res = await as.get(
		`/oauth/callback?code=good-code&state=${authorize.searchParams.get('state')}&iss=${encodeURIComponent(ISSUER)}`
	);
	return { authorize, res, handoff: handoffOf(res.text) };
};

describe('the login page', () => {
	it('offers the sign-in button next to the password form', async () => {
		const res = await client.get('/iframe/login');
		expect(res.status).toBe(200);
		expect(res.text).toContain('Continue with Accounts');
		expect(res.text).toContain('"/cms/oauth/start"');
		expect(res.text).toContain('name="password"');
		// the hand-off is only taken from the popup this page opened, on this origin
		expect(res.text).toContain('event.origin !== window.location.origin');
		expect(res.text).toContain('event.source !== popup');
	});

	it('is the button alone for a host with no passwords', async () => {
		const local = localEditors({
			scrypt: FAST,
			oauth: { label: 'Continue', issuer: () => ISSUER, identify: async () => ana }
		});
		const { login: _login, ...withoutPasswords } = local;
		const only = createCmsBackend({
			dbPath: ':memory:',
			auth: withoutPasswords,
			resolveProject: () => 'p1'
		});
		const only_client = createCmsTestClient(only, { basePath: '/cms', origin: ORIGIN });

		const page = await only_client.get('/iframe/login');
		expect(page.status).toBe(200);
		expect(page.text).toContain('Continue');
		expect(page.text).not.toContain('name="password"');

		const form = new FormData();
		form.set('email', 'local@example.com');
		form.set('password', 'password');
		expect((await only_client.post('/iframe/login', { formData: form })).status).toBe(404);
		only.close();
	});

	it('has none of this without the option', async () => {
		const plain = createCmsBackend({
			dbPath: ':memory:',
			auth: localEditors({ scrypt: FAST }),
			resolveProject: () => 'p1'
		});
		const plainClient = createCmsTestClient(plain, { basePath: '/cms', origin: ORIGIN });
		expect((await plainClient.get('/iframe/login')).text).not.toContain('id="oauth"');
		for (const path of ['/oauth/start', '/oauth/callback', '/oauth/client.json']) {
			expect((await plainClient.get(path)).status, path).toBe(404);
		}
		plain.close();
	});
});

describe('the client', () => {
	it('names itself with a metadata document where the server reads those', async () => {
		const doc = await client.get('/oauth/client.json');
		expect(doc.json()).toEqual({
			client_id: `${MOUNT}/oauth/client.json`,
			client_name: 'Site editor',
			redirect_uris: [`${MOUNT}/oauth/callback`],
			grant_types: ['authorization_code'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none'
		});

		const authorize = await start();
		expect(authorize.searchParams.get('client_id')).toBe(`${MOUNT}/oauth/client.json`);
		expect(server.registrations).toHaveLength(0);
	});

	it('registers once where it cannot: an older server, or a mount without https', async () => {
		server.supportsDocuments = false;
		const first = await start();
		const second = await start();
		expect(first.searchParams.get('client_id')).toBe('registered-1');
		expect(second.searchParams.get('client_id')).toBe('registered-1');
		expect(server.registrations).toEqual([
			expect.objectContaining({
				client_name: 'Site editor',
				redirect_uris: [`${MOUNT}/oauth/callback`],
				token_endpoint_auth_method: 'none'
			})
		]);

		// a day on, the server may have dropped a registration nobody holds a grant under
		vi.useFakeTimers({ now: Date.now() + 25 * 60 * 60 * 1000, toFake: ['Date'] });
		expect((await start()).searchParams.get('client_id')).toBe('registered-2');
		vi.useRealTimers();

		server.supportsDocuments = true;
		const plain = createCmsTestClient(backend, {
			basePath: '/cms',
			origin: 'http://localhost:5173'
		});
		const local = await start(plain);
		expect(local.searchParams.get('client_id')).toBe('registered-3');
	});
});

describe('GET /oauth/start', () => {
	it('sends the popup to the authorization server with a PKCE challenge for this mount', async () => {
		const authorize = await start();
		expect(authorize.origin + authorize.pathname).toBe(`${ISSUER}/authorize`);
		const query = authorize.searchParams;
		expect(query.get('response_type')).toBe('code');
		expect(query.get('redirect_uri')).toBe(`${MOUNT}/oauth/callback`);
		expect(query.get('resource')).toBe(MOUNT);
		expect(query.get('scope')).toBe('site:edit');
		expect(query.get('code_challenge_method')).toBe('S256');
		expect(query.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(query.get('state')).toBeTruthy();

		// the verifier stays here, in a cookie only this mount is sent
		const cookie = client.cookies.all().find((entry) => entry.name === 'cms_session_oauth');
		expect(cookie?.path).toBe('/cms');
	});

	it('refuses to start against a server that is not the one configured', async () => {
		server.metadataIssuer = 'https://evil.test';
		const res = await client.get('/oauth/start');
		expect(res.status).toBe(502);
		expect(res.headers.get('location')).toBeNull();
	});
});

describe('GET /oauth/callback', () => {
	it('exchanges the code with the verifier and hands the login page a one-time token', async () => {
		const { authorize, res, handoff } = await signIn();
		expect(res.status).toBe(200);
		expect(handoff).toBeTruthy();
		// only to the page that opened it, on this origin
		expect(res.text).toContain('window.location.origin');
		expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");

		const [exchange] = server.tokenRequests;
		expect(exchange.get('grant_type')).toBe('authorization_code');
		expect(exchange.get('code')).toBe('good-code');
		expect(exchange.get('redirect_uri')).toBe(`${MOUNT}/oauth/callback`);
		expect(exchange.get('resource')).toBe(MOUNT);
		expect(exchange.get('client_id')).toBe(`${MOUNT}/oauth/client.json`);
		const challenge = createHash('sha256')
			.update(exchange.get('code_verifier')!)
			.digest('base64url');
		expect(challenge).toBe(authorize.searchParams.get('code_challenge'));

		// the popup itself gets no session: the cookie belongs to the framed page
		expect(client.cookies.get('cms_session')).toBeUndefined();
		// and the token has done its job
		await vi.waitFor(() => expect(server.revoked).toEqual(['rt']));
	});

	it('gives the editor an ordinary session when the login page posts the token', async () => {
		const { handoff } = await signIn();
		const res = await client.post('/iframe/login', { formData: handoffForm(handoff!) });
		expect(res.status).toBe(200);
		expect(res.text).toContain('velastack-cms-login-success');

		const user = await client.get('/user');
		expect(user.json()).toEqual({ user: ana });

		// once: the token is spent
		const fresh = createCmsTestClient(backend, { basePath: '/cms', origin: ORIGIN });
		const again = await fresh.post('/iframe/login', { formData: handoffForm(handoff!) });
		expect(again.status).toBe(400);
		expect(again.text).toContain('expired');
		expect((await fresh.get('/user')).status).toBe(403);
	});

	it('keeps the editor apart from a password account with the same address', async () => {
		await backend.editors.create({
			email: 'ana@example.com',
			password: 'password',
			projects: ['p2']
		});
		const { handoff } = await signIn();
		await client.post('/iframe/login', { formData: handoffForm(handoff!) });

		expect((await client.get('/user')).json()).toEqual({ user: ana });
		// the password account's sites are not theirs for having its address
		expect(backend.editors.can('user_ana', 'p2')).toBe(false);
		expect(backend.editors.find('ana@example.com')!.id).not.toBe('user_ana');
		// and the password still signs in as the password account
		expect((await backend.editors.verify('ana@example.com', 'password'))!.id).not.toBe('user_ana');
	});

	it('refreshes the name and address on the next sign-in', async () => {
		let { handoff } = await signIn();
		await client.post('/iframe/login', { formData: handoffForm(handoff!) });
		server.identity = { ...ana, email: 'ana@new.example', name: 'Ana María' };
		({ handoff } = await signIn());
		await client.post('/iframe/login', { formData: handoffForm(handoff!) });
		expect((await client.get('/user')).json()).toEqual({
			user: { id: 'user_ana', email: 'ana@new.example', name: 'Ana María' }
		});
	});

	it('refuses an account that may not edit this site', async () => {
		mayEdit = () => false;
		const { res, handoff } = await signIn();
		expect(res.status).toBe(403);
		expect(res.text).toContain('ana@example.com can&#39;t edit this site');
		expect(handoff).toBeNull();
	});

	it('refuses a hand-off once access has been taken away', async () => {
		const { handoff } = await signIn();
		mayEdit = () => false;
		const res = await client.post('/iframe/login', { formData: handoffForm(handoff!) });
		expect(res.status).toBe(400);
		expect((await client.get('/user')).status).toBe(403);
	});

	it('refuses a token the host does not vouch for', async () => {
		server.identity = null;
		const { res, handoff } = await signIn();
		expect(res.status).toBe(403);
		expect(handoff).toBeNull();
	});

	it('refuses an answer to a sign-in it did not start', async () => {
		// no cookie: another browser
		const other = createCmsTestClient(backend, { basePath: '/cms', origin: ORIGIN });
		const authorize = await start();
		const state = authorize.searchParams.get('state');
		expect((await other.get(`/oauth/callback?code=good-code&state=${state}`)).status).toBe(400);

		// the wrong state
		await start();
		expect((await client.get('/oauth/callback?code=good-code&state=forged')).status).toBe(400);
		expect(server.tokenRequests).toHaveLength(0);
	});

	it('uses a started sign-in once', async () => {
		const authorize = await start();
		const url = `/oauth/callback?code=good-code&state=${authorize.searchParams.get('state')}`;
		expect((await client.get(url)).status).toBe(200);
		expect((await client.get(url)).status).toBe(400);
	});

	it('refuses an answer from another server', async () => {
		const authorize = await start();
		const res = await client.get(
			`/oauth/callback?code=good-code&state=${authorize.searchParams.get('state')}&iss=${encodeURIComponent('https://evil.test')}`
		);
		expect(res.status).toBe(400);
		expect(server.tokenRequests).toHaveLength(0);
	});

	it('says so when the person cancelled, or the code is no good', async () => {
		let authorize = await start();
		const cancelled = await client.get(
			`/oauth/callback?error=access_denied&state=${authorize.searchParams.get('state')}`
		);
		expect(cancelled.status).toBe(200);
		expect(cancelled.text).toContain('Sign-in cancelled');

		authorize = await start();
		const bad = await client.get(
			`/oauth/callback?code=bad&state=${authorize.searchParams.get('state')}`
		);
		expect(bad.status).toBe(502);
		expect(handoffOf(bad.text)).toBeNull();
	});
});

describe('password sign-in next to it', () => {
	it('still works, and an external editor has no password to try', async () => {
		const { handoff } = await signIn();
		await client.post('/iframe/login', { formData: handoffForm(handoff!) });

		const form = new FormData();
		form.set('email', 'ana@example.com');
		form.set('password', '');
		const fresh = createCmsTestClient(backend, { basePath: '/cms', origin: ORIGIN });
		expect((await fresh.post('/iframe/login', { formData: form })).status).toBe(400);
		expect(await backend.editors.verify('ana@example.com', '')).toBeNull();
		expect(await backend.editors.verify('external:user_ana', '')).toBeNull();
		expect(await backend.editors.verify('external:user_ana', 'anything')).toBeNull();

		const local = new FormData();
		local.set('email', 'local@example.com');
		local.set('password', 'password');
		expect((await fresh.post('/iframe/login', { formData: local })).text).toContain(
			'velastack-cms-login-success'
		);
	});
});
