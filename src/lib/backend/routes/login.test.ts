import { beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from '../testing/harness.js';

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
	it('sets a session cookie and shows the success screen', async () => {
		const res = await client.post('/iframe/login', {
			formData: form('a@example.com', 'password')
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('set-cookie')).toMatch(/cms_session=/);
		expect(res.text).toContain('velastack-cms-login-success');
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

describe('GET /iframe/login/success', () => {
	it('redirects to the form when there is no session', async () => {
		const res = await client.get('/iframe/login/success');
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
		expect(res.headers.get('set-cookie')).toMatch(/cms_session=;?\s*.*Max-Age=0/);

		// The token is dead even if a copy of it is replayed.
		const replay = createCmsTestClient(backend, { basePath: '/cms' }).as(`cms_session=${token}`);
		expect((await replay.get('/user')).status).toBe(403);
	});

	it('is idempotent when not signed in', async () => {
		expect((await client.post('/logout')).status).toBe(204);
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
