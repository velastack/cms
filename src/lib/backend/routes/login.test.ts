import { beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from '../testing/harness.js';
import type { CmsAuthAdapter } from '../types.js';

/**
 * The login flow is the one thing whose *shape* changed: it used to be two
 * superforms-backed Svelte pages, and is now HTML served straight from the
 * handler. Same URLs, same status codes, same cookie — different body format,
 * and no `sveltekit-superforms` / `zod` / shadcn in the dependency graph.
 */
const FAST = { N: 1024, r: 8, p: 1 };

let backend: CmsBackend;
let client: CmsTestClient;

const form = (email: string, password: string) => {
	const fd = new FormData();
	fd.set('email', email);
	fd.set('password', password);
	return fd;
};

/** A `set-cookie` header's attributes, so assertions never depend on order. */
const attrs = (cookie: string) => cookie.split(';').map((s) => s.trim());

beforeEach(async () => {
	backend = createCmsBackend({
		dbPath: ':memory:',
		auth: localEditors({ scrypt: FAST }),
		resolveProject: () => 'p1',
		frameAncestors: '*'
	});
	await backend.editors.create({ email: 'a@example.com', password: 'password', projects: ['p1'] });
	client = createCmsTestClient(backend, { basePath: '/cms' });
});

describe('GET /iframe/login', () => {
	it('serves a form that can be framed by the embedding site', async () => {
		const res = await client.get('/iframe/login');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('content-security-policy')).toBe('frame-ancestors *');
		expect(res.text).toContain('name="email"');
		expect(res.text).toContain('name="password"');
		expect(res.text).toContain('method="POST"');
	});

	it('is never cached', async () => {
		const res = await client.get('/iframe/login');
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('shows the signed-in screen when a session is already present', async () => {
		const id = backend.editors.find('a@example.com')!.id;
		const authed = client.as(`cms_session=${backend.editors.createSession(id).token}`);
		const res = await authed.get('/iframe/login');
		expect(res.status).toBe(200);
		expect(res.text).toContain('velastack-cms-login-success');
	});
});

describe('POST /iframe/login', () => {
	it('sets a session cookie scoped to the mount and shows the success screen', async () => {
		const res = await client.post('/iframe/login', {
			formData: form('a@example.com', 'password')
		});
		expect(res.status).toBe(200);
		expect(res.text).toContain('velastack-cms-login-success');
		const cookies = res.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toMatch(/^cms_session=[^;]+;/);
		expect(attrs(cookies[0])).toContain('Path=/cms');
		// The root-scoped cookie versions before 0.3.1 set is expired alongside.
		expect(cookies[1]).toMatch(/^cms_session=;/);
		expect(attrs(cookies[1])).toContain('Path=/');
		expect(attrs(cookies[1])).toContain('Max-Age=0');
	});

	it('produces a session the rest of the API accepts', async () => {
		await client.post('/iframe/login', { formData: form('a@example.com', 'password') });
		const res = await client.get('/user');
		expect(res.status).toBe(200);
		expect(res.json<{ user: { email: string } }>().user.email).toBe('a@example.com');
	});

	it('sets an HttpOnly cookie', async () => {
		const res = await client.post('/iframe/login', {
			formData: form('a@example.com', 'password')
		});
		expect(res.headers.get('set-cookie')).toContain('HttpOnly');
	});

	it('rejects a wrong password without setting a cookie', async () => {
		const res = await client.post('/iframe/login', { formData: form('a@example.com', 'nope') });
		expect(res.status).toBe(400);
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(res.text).toContain('Invalid email or password');
	});

	it('gives the same message for an unknown account', async () => {
		const res = await client.post('/iframe/login', { formData: form('who@example.com', 'pw') });
		expect(res.status).toBe(400);
		expect(res.text).toContain('Invalid email or password');
	});

	it('400s a submission missing a field', async () => {
		const fd = new FormData();
		fd.set('email', 'a@example.com');
		const res = await client.post('/iframe/login', { formData: fd });
		expect(res.status).toBe(400);
		expect(res.text).toContain('Enter both an email and a password');
	});

	it('escapes the error into the page rather than interpolating markup', async () => {
		const res = await client.post('/iframe/login', {
			formData: form('<script>alert(1)</script>@example.com', 'pw')
		});
		expect(res.text).not.toContain('<script>alert(1)</script>');
	});
});

describe('POST /iframe/login for an account with no grant here', () => {
	// Records the grants `login` minted, so a test can check the router threw
	// away the one it refused to issue.
	const minted: string[] = [];
	const recording = (overrides: Partial<CmsAuthAdapter> = {}): CmsAuthAdapter => {
		const inner = localEditors({ scrypt: FAST });
		return {
			...inner,
			login: async (email, password, ctx) => {
				const grant = await inner.login!(email, password, ctx);
				if (grant) minted.push(grant.token);
				return grant;
			},
			...overrides
		};
	};
	const withAdapter = async (auth: CmsAuthAdapter) => {
		const b = createCmsBackend({ dbPath: ':memory:', auth, resolveProject: () => 'p1' });
		await b.editors.create({ email: 'stranger@example.com', password: 'password', projects: [] });
		return { backend: b, client: createCmsTestClient(b, { basePath: '/cms' }) };
	};

	beforeEach(() => {
		minted.length = 0;
	});

	it('refuses with the reason, sets no cookie, and throws the session away', async () => {
		const { backend: b, client: c } = await withAdapter(recording());
		const res = await c.post('/iframe/login', {
			formData: form('stranger@example.com', 'password')
		});
		expect(res.status).toBe(403);
		expect(res.text).toContain('stranger@example.com can&#39;t edit this site');
		expect(res.text).not.toContain('velastack-cms-login-success');
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(minted).toHaveLength(1);
		expect(b.editors.resolveSession(minted[0])).toBeNull();
		expect((await c.get('/user')).status).toBe(403);
	});

	it('still refuses when the adapter has no discard hook', async () => {
		const { backend: b, client: c } = await withAdapter(recording({ discard: undefined }));
		const res = await c.post('/iframe/login', {
			formData: form('stranger@example.com', 'password')
		});
		expect(res.status).toBe(403);
		expect(res.headers.get('set-cookie')).toBeNull();
		// The token never left the process; only the server-side row lingers.
		expect(b.editors.resolveSession(minted[0])).not.toBeNull();
	});
});

describe('GET /iframe/login/success', () => {
	it('redirects to the form when there is no session', async () => {
		const res = await client.get('/iframe/login/success');
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/cms/iframe/login');
	});

	it('redirects to the form when the session has no grant here', async () => {
		const stranger = await backend.editors.create({
			email: 'stranger@example.com',
			password: 'password',
			projects: []
		});
		const foreign = client.as(`cms_session=${backend.editors.createSession(stranger.id).token}`);
		const res = await foreign.get('/iframe/login/success');
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/cms/iframe/login');
	});

	it('notifies the parent window when signed in', async () => {
		await client.post('/iframe/login', { formData: form('a@example.com', 'password') });
		const res = await client.get('/iframe/login/success');
		expect(res.status).toBe(200);
		expect(res.text).toContain('velastack-cms-login-success');
	});
});

describe('POST /logout', () => {
	it('clears the cookie and invalidates the session server-side', async () => {
		await client.post('/iframe/login', { formData: form('a@example.com', 'password') });
		const token = client.cookies.get('cms_session')!;

		const res = await client.post('/logout');
		expect(res.status).toBe(204);
		const cleared = res.headers.getSetCookie();
		expect(cleared).toHaveLength(2);
		for (const c of cleared) expect(attrs(c)).toContain('Max-Age=0');
		expect(cleared.map((c) => attrs(c).find((a) => a.startsWith('Path=')))).toEqual([
			'Path=/cms',
			'Path=/'
		]);
		expect(client.cookies.get('cms_session')).toBeUndefined();

		// The token is dead even if a copy of it is replayed.
		const replay = createCmsTestClient(backend, { basePath: '/cms' }).as(`cms_session=${token}`);
		expect((await replay.get('/user')).status).toBe(403);
	});

	it('is idempotent when not signed in', async () => {
		expect((await client.post('/logout')).status).toBe(204);
	});
});

describe('with an explicit cookie path', () => {
	it('uses it as given and expires nothing else', async () => {
		const rooted = createCmsBackend({
			dbPath: ':memory:',
			auth: localEditors({ scrypt: FAST }),
			resolveProject: () => 'p1',
			cookie: { path: '/' }
		});
		await rooted.editors.create({ email: 'a@example.com', password: 'password', projects: ['p1'] });
		const c = createCmsTestClient(rooted, { basePath: '/cms' });

		const login = await c.post('/iframe/login', { formData: form('a@example.com', 'password') });
		expect(login.headers.getSetCookie()).toHaveLength(1);
		expect(attrs(login.headers.getSetCookie()[0])).toContain('Path=/');
		expect((await c.get('/user')).status).toBe(200);

		const out = await c.post('/logout');
		expect(out.headers.getSetCookie()).toHaveLength(1);
		expect(attrs(out.headers.getSetCookie()[0])).toContain('Max-Age=0');
	});
});

describe('when the adapter has no login', () => {
	it('404s the login routes and leaves sign-in to the host', async () => {
		const hostOwned = createCmsBackend({
			dbPath: ':memory:',
			resolveProject: () => 'p1',
			auth: {
				resolve: async () => null,
				authorize: async () => true
			}
		});
		const c = createCmsTestClient(hostOwned, { basePath: '/cms' });
		expect((await c.get('/iframe/login')).status).toBe(404);
		expect((await c.post('/iframe/login', { formData: form('a@b.c', 'pw') })).status).toBe(404);
	});
});
