import { beforeEach, describe, expect, it } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';

/**
 * One browser, several sites on one origin. The cookie is scoped to each
 * mount, so sessions coexist; a session that reaches a mount it has no grant
 * on is anonymous there, and the login page says so instead of looping.
 */
const A = 'p_alice';
const B = 'p_bob';
const mount = (p: string) => `/v1/projects/${p}/cms`;

const form = (email: string, password: string) => {
	const fd = new FormData();
	fd.set('email', email);
	fd.set('password', password);
	return fd;
};
const attrs = (cookie: string) => cookie.split(';').map((s) => s.trim());
const pathOf = (cookie: string) => attrs(cookie).find((a) => a.startsWith('Path='));
type UserBody = { user: { email: string } };

let fx: TestFixture;

beforeEach(async () => {
	fx = await createTestFixture();
});

describe('a session from another project', () => {
	it('gets the form with a hint, never the signed-in screen', async () => {
		// A root-scoped cookie, as a login from before 0.3.1 left it.
		const res = await fx.at(B, fx.alice).get('/iframe/login');
		expect(res.status).toBe(200);
		expect(res.text).toContain('name="password"');
		expect(res.text).toContain('alice@example.com');
		expect(res.text).toContain('can&#39;t edit this site');
		expect(res.text).not.toContain('velastack-cms-login-success');
	});
});

describe('signing in', () => {
	it('scopes the cookie to the mount and expires the root one', async () => {
		const res = await fx
			.at(A)
			.post('/iframe/login', { formData: form('alice@example.com', 'password') });
		expect(res.status).toBe(200);
		expect(res.text).toContain('velastack-cms-login-success');
		const cookies = res.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toMatch(/^cms_session=[^;]+;/);
		expect(pathOf(cookies[0])).toBe(`Path=${mount(A)}`);
		expect(pathOf(cookies[1])).toBe('Path=/');
		expect(attrs(cookies[1])).toContain('Max-Age=0');
	});

	it('keeps independent sessions per mount, and logout touches only its own', async () => {
		const onA = fx.at(A);
		await onA.post('/iframe/login', { formData: form('alice@example.com', 'password') });
		const onB = onA.at(mount(B), { project_id: B });
		await onB.post('/iframe/login', { formData: form('bob@example.com', 'password') });

		expect((await onB.get('/user')).json<UserBody>().user.email).toBe('bob@example.com');
		const backOnA = onB.at(mount(A), { project_id: A });
		expect((await backOnA.get('/user')).json<UserBody>().user.email).toBe('alice@example.com');
		expect(
			onB.cookies
				.all()
				.map((c) => c.path)
				.sort()
		).toEqual([mount(A), mount(B)]);

		const out = await onB.post('/logout');
		expect(out.status).toBe(204);
		const cleared = out.headers.getSetCookie();
		expect(cleared.map(pathOf).sort()).toEqual(['Path=/', `Path=${mount(B)}`]);
		for (const c of cleared) expect(attrs(c)).toContain('Max-Age=0');
		expect((await onB.get('/user')).status).toBe(403);
		expect((await onB.at(mount(A), { project_id: A }).get('/user')).status).toBe(200);
		expect(onB.cookies.all().map((c) => c.path)).toEqual([mount(A)]);
	});

	it('treats a scoped session whose grant was revoked as anonymous', async () => {
		const onA = fx.at(A);
		await onA.post('/iframe/login', { formData: form('alice@example.com', 'password') });
		expect(fx.backend.editors.revoke(fx.users.alice.id, A)).toBe(true);
		expect((await onA.get('/user')).status).toBe(403);
		expect((await onA.get('/site')).status).toBe(200);
		const login = await onA.get('/iframe/login');
		expect(login.text).toContain('alice@example.com');
		expect(login.text).not.toContain('velastack-cms-login-success');
	});
});

describe('logging out', () => {
	it('ends every session the request presented', async () => {
		// A root cookie from before 0.3.1 next to a mount-scoped one.
		const legacy = fx.backend.editors.createSession(fx.users.alice.id).token;
		const scoped = fx.backend.editors.createSession(fx.users.alice.id).token;
		const c = fx.anon.as(`cms_session=${legacy}`);
		c.cookies.set('cms_session', scoped, mount('p1'));

		expect((await c.post('/logout')).status).toBe(204);
		expect(fx.backend.editors.resolveSession(legacy)).toBeNull();
		expect(fx.backend.editors.resolveSession(scoped)).toBeNull();
	});
});
