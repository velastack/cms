import { beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend, type CmsBackend } from './factory.js';
import { localEditors } from './auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from './testing/harness.js';

const FAST = { N: 1024, r: 8, p: 1 };
const BASE = '/v1/projects/p1/cms';

let backend: CmsBackend;
let anon: CmsTestClient;
let alice: CmsTestClient;
let aliceId: string;

beforeEach(async () => {
	backend = createCmsBackend({
		dbPath: ':memory:',
		testReset: true,
		auth: localEditors({ scrypt: FAST }),
		resolveProject: (event) => (event.params as Record<string, string>).project_id ?? null
	});
	const a = await backend.editors.create({
		email: 'alice@example.com',
		password: 'password',
		name: 'Alice',
		projects: ['p1', 'p_alice']
	});
	aliceId = a.id;
	await backend.editors.create({
		email: 'bob@example.com',
		password: 'password',
		name: 'Bob',
		projects: ['p1', 'p_bob']
	});
	anon = createCmsTestClient(backend, { basePath: BASE, params: { project_id: 'p1' } });
	alice = anon.as(`cms_session=${backend.editors.createSession(aliceId).token}`);
});

describe('dispatch', () => {
	it('routes a nested path to its handler', async () => {
		const res = await alice.get('/release');
		expect(res.status).toBe(200);
		expect(res.json<{ release: unknown }>().release).toBeNull();
	});

	it('404s an unknown path', async () => {
		const res = await alice.get('/nonsense');
		expect(res.status).toBe(404);
	});

	it('404s a path that only partly matches', async () => {
		const res = await alice.get('/release/history/abc');
		expect(res.status).toBe(404);
	});

	it('405s a known path with the wrong method, and says what is allowed', async () => {
		const res = await alice.del('/docs');
		expect(res.status).toBe(405);
		const allow = res.headers.get('allow') ?? '';
		expect(allow).toContain('GET');
		expect(allow).toContain('OPTIONS');
	});

	it('distinguishes /media from /media/:id', async () => {
		expect((await alice.get('/media')).status).toBe(200);
		expect((await alice.del('/media/nope')).status).toBe(404);
	});

	it('treats HEAD as GET', async () => {
		const res = await alice.request('HEAD', '/site');
		expect(res.status).toBe(200);
	});

	it('answers OPTIONS without auth', async () => {
		const res = await anon.request('OPTIONS', '/docs');
		expect(res.status).toBe(204);
	});
});

describe('authentication', () => {
	it('403s protected routes for anonymous callers', async () => {
		for (const path of ['/user', '/release', '/release/history', '/media']) {
			expect((await anon.get(path)).status).toBe(403);
		}
	});

	it('serves published reads to anonymous callers', async () => {
		await backend.testing.reset('p1', { layoutDocs: { '/': { header: { title: 'Hi' } } } });
		const res = await anon.get('/docs?kind=layout&routeId=/');
		expect(res.status).toBe(200);
		expect(res.json<{ contents: unknown }>().contents).toEqual({ header: { title: 'Hi' } });
	});

	it('treats an unknown session as anonymous rather than an error', async () => {
		const stranger = anon.as('cms_session=nope');
		expect((await stranger.get('/user')).status).toBe(403);
		expect((await stranger.get('/site')).status).toBe(200);
	});

	it('identifies a signed-in editor', async () => {
		const res = await alice.get('/user');
		expect(res.status).toBe(200);
		expect(res.json<{ user: { email: string } }>().user.email).toBe('alice@example.com');
	});
});

describe('cross-project authorization', () => {
	// The behaviour the original could not deliver: userCanAccessProject
	// returned true unconditionally, so every one of these was a false green.
	const bobOnly = { basePath: '/v1/projects/p_bob/cms', params: { project_id: 'p_bob' } };

	it("403s alice on bob's project", async () => {
		const res = await alice.at(bobOnly.basePath, bobOnly.params).get('/user');
		expect(res.status).toBe(403);
	});

	it('lets alice reach her own project', async () => {
		const res = await alice.at('/v1/projects/p_alice/cms', { project_id: 'p_alice' }).get('/user');
		expect(res.status).toBe(200);
	});

	it("blocks alice's writes to bob's project before touching the database", async () => {
		const res = await alice.at(bobOnly.basePath, bobOnly.params).post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { footer: { copy: 'X' } } }]
			}
		});
		expect(res.status).toBe(403);

		// Bob's project saw nothing.
		const bob = anon
			.as(
				`cms_session=${backend.editors.createSession(backend.editors.find('bob@example.com')!.id).token}`
			)
			.at(bobOnly.basePath, bobOnly.params);
		expect((await bob.get('/pages?locale=en')).json<{ routes: unknown[] }>().routes).toEqual([]);
	});

	it('lets both editors into the shared project', async () => {
		const bob = anon.as(
			`cms_session=${backend.editors.createSession(backend.editors.find('bob@example.com')!.id).token}`
		);
		expect((await alice.get('/user')).status).toBe(200);
		expect((await bob.get('/user')).status).toBe(200);
	});

	it('still allows login and logout on a project the session cannot reach', async () => {
		const onBob = alice.at(bobOnly.basePath, bobOnly.params);
		expect((await onBob.get('/iframe/login')).status).toBe(200);
		expect((await onBob.post('/logout')).status).toBe(204);
	});
});

describe('tenancy', () => {
	it('404s when the project cannot be resolved', async () => {
		const nameless = createCmsTestClient(
			createCmsBackend({
				dbPath: ':memory:',
				auth: localEditors({ scrypt: FAST }),
				resolveProject: () => null
			}),
			{ basePath: '/cms' }
		);
		expect((await nameless.get('/site')).status).toBe(404);
	});

	it('defaults to a single tenant when no resolver is given', async () => {
		const single = createCmsBackend({ dbPath: ':memory:', auth: localEditors({ scrypt: FAST }) });
		const client = createCmsTestClient(single, { basePath: '/cms' });
		const res = await client.get('/site');
		expect(res.status).toBe(200);
		expect(res.json<{ contents: unknown }>().contents).toEqual({});
	});
});
