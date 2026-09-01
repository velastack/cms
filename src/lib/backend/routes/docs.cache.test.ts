import { beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from '../testing/harness.js';

/**
 * The response headers here are a contract the shipped client and any CDN in
 * front of it already depend on. They are asserted literally, not derived.
 */
const PUBLIC_CC = 'public, max-age=10, stale-while-revalidate=300, s-maxage=300';
const IMMUTABLE_CC = 'public, max-age=31536000, immutable';
const JSON_TYPE = 'application/json; charset=utf-8';
const FAST = { N: 1024, r: 8, p: 1 };

let backend: CmsBackend;
let anon: CmsTestClient;
let editor: CmsTestClient;

beforeEach(async () => {
	backend = createCmsBackend({
		dbPath: ':memory:',
		testReset: true,
		auth: localEditors({ scrypt: FAST }),
		resolveProject: (event) => (event.params as Record<string, string>).project_id ?? null
	});
	const a = await backend.editors.create({
		email: 'a@example.com',
		password: 'pw',
		projects: ['p1']
	});
	anon = createCmsTestClient(backend, {
		basePath: '/v1/projects/p1/cms',
		params: { project_id: 'p1' }
	});
	editor = anon.as(`cms_session=${backend.editors.createSession(a.id).token}`);
	await backend.testing.reset('p1', { layoutDocs: { '/': { header: { title: 'Hi' } } } });
});

describe('public reads', () => {
	it('carry the short browser TTL, the CDN TTL, and an ETag', async () => {
		const res = await anon.get('/docs?kind=layout&routeId=/');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(PUBLIC_CC);
		expect(res.headers.get('content-type')).toBe(JSON_TYPE);
		expect(res.headers.get('etag')).toMatch(/^"\d+"$/);
	});

	it('answer If-None-Match with a 304 and no body', async () => {
		const first = await anon.get('/docs?kind=layout&routeId=/');
		const etag = first.headers.get('etag')!;
		const second = await anon.get('/docs?kind=layout&routeId=/', {
			headers: { 'if-none-match': etag }
		});
		expect(second.status).toBe(304);
		expect(second.text).toBe('');
		expect(second.headers.get('cache-control')).toBe(PUBLIC_CC);
		expect(second.headers.get('etag')).toBe(etag);
	});

	it('serve identical bytes from the warm cache', async () => {
		const first = await anon.get('/docs?kind=layout&routeId=/');
		const second = await anon.get('/docs?kind=layout&routeId=/');
		expect(second.status).toBe(200);
		expect(second.text).toBe(first.text);
	});

	it('negative-cache a miss without populating the LRU', async () => {
		const res = await anon.get('/docs?kind=layout&routeId=/nope');
		expect(res.status).toBe(404);
		expect(res.headers.get('cache-control')).toBe(PUBLIC_CC);
		expect(res.headers.get('etag')).toMatch(/^"\d+"$/);
	});

	it('change ETag when a publish bumps the version', async () => {
		const before = (await anon.get('/docs?kind=layout&routeId=/')).headers.get('etag');
		await editor.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { header: { title: 'New' } } }]
			}
		});
		await editor.post('/release/publish', { body: {} });
		const after = await anon.get('/docs?kind=layout&routeId=/');
		expect(after.headers.get('etag')).not.toBe(before);
		expect(after.json<{ contents: { header: { title: string } } }>().contents.header.title).toBe(
			'New'
		);
	});
});

describe('version reads', () => {
	it('are immutable', async () => {
		await editor.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { header: { title: 'V1' } } }]
			}
		});
		const published = await editor.post('/release/publish', { body: {} });
		const key = published.json<{ release: { preview_key: string } }>().release.preview_key;

		const res = await anon.get(`/docs?kind=layout&routeId=/&version=${key}`);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CC);
	});
});

describe('preview reads', () => {
	it('bypass every cache layer', async () => {
		await editor.post('/release/items', {
			body: {
				items: [
					{ kind: 'layout', routeId: '/', locale: 'en', tree: { header: { title: 'Draft' } } }
				]
			}
		});
		const release = (await editor.get('/release')).json<{
			release: { preview_key: string };
		}>().release;

		const res = await anon.get(`/docs?kind=layout&routeId=/&preview=${release.preview_key}`);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBeNull();
		expect(res.headers.get('etag')).toBeNull();
		expect(res.json<{ contents: { header: { title: string } } }>().contents.header.title).toBe(
			'Draft'
		);
	});

	it('lose to ?version= when both are present', async () => {
		await editor.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { header: { title: 'V1' } } }]
			}
		});
		const key = (await editor.post('/release/publish', { body: {} })).json<{
			release: { preview_key: string };
		}>().release.preview_key;

		await editor.post('/release/items', {
			body: {
				items: [
					{ kind: 'layout', routeId: '/', locale: 'en', tree: { header: { title: 'Draft' } } }
				]
			}
		});
		const preview = (await editor.get('/release')).json<{
			release: { preview_key: string };
		}>().release.preview_key;

		const res = await anon.get(`/docs?kind=layout&routeId=/&version=${key}&preview=${preview}`);
		expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CC);
		expect(res.json<{ contents: { header: { title: string } } }>().contents.header.title).toBe(
			'V1'
		);
	});
});

describe('authenticated /pages reads', () => {
	it('bypass the cache, because the body varies per editor', async () => {
		const res = await editor.get('/pages?locale=en');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBeNull();
	});

	it('are cached for anonymous callers', async () => {
		const res = await anon.get('/pages?locale=en');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(PUBLIC_CC);
	});
});
