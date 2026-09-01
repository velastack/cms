import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';

let fx: TestFixture;
const reset = (seed: Record<string, unknown> = {}) => fx.backend.testing.reset('p1', seed);
const get = (path: string, init?: Record<string, unknown>) => fx.anon.get(path, init);
const post = (path: string, init?: Record<string, unknown>) => fx.anon.post(path, init);
const del = (path: string, init?: Record<string, unknown>) => fx.anon.del(path, init);
const as = (user: string) => (user === 'bob' ? fx.bob : fx.alice);

beforeEach(async () => {
	fx = await createTestFixture();
});

describe('GET /pages — cache headers', () => {
	beforeEach(() =>
		reset({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: {} }] }
		})
	);

	it('serves Cache-Control + ETag on an anonymous read', async () => {
		const res = await get('/pages?locale=en');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toMatch(/public/);
		expect(res.headers.get('etag')).toMatch(/^"\d+"$/);
	});

	it('returns 304 on If-None-Match for the anonymous path', async () => {
		const first = await get('/pages?locale=en');
		const conditional = await fx.anon.get(`/pages?locale=en`, {
			headers: { 'if-none-match': first.headers.get('etag')! }
		});
		expect(conditional.status).toBe(304);
	});

	it('bypasses cache on authenticated reads (response varies by user drafts)', async () => {
		const res = await fx.alice.get(`/pages?locale=en`);
		expect(res.status).toBe(200);
		// Authenticated path doesn't go through the cache helper.
		expect(res.headers.get('cache-control')).toBeNull();
		expect(res.headers.get('etag')).toBeNull();
	});

	it('does not surface a draft-only route to anonymous cached reads', async () => {
		await fx.alice.post('/pages', {
			body: {
				routeId: '/r/[slug]',
				locale: 'en',
				params: { slug: 'draft-only' }
			}
		});

		const anon = await get('/pages?locale=en');
		const route = anon
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/r/[slug]');
		const slugs = route.entries.map((e: { params: { slug: string } }) => e.params.slug);
		expect(slugs).toContain('a');
		expect(slugs).not.toContain('draft-only');
	});

	it('serves immutable Cache-Control on ?version= reads', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'b' },
						tree: { hero: 'B' }
					}
				]
			}
		});
		const publish = await fx.alice.post('/release/publish');
		const versionKey = publish.json<any>().release.preview_key as string;

		const res = await get(`/pages?locale=en&version=${versionKey}`);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toMatch(/immutable/);
	});

	it('cache-busts after a publish', async () => {
		const before = await get('/pages?locale=en');
		const oldEtag = before.headers.get('etag');

		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'b' },
						tree: { metadata: { title: 'B' } }
					}
				]
			}
		});
		await fx.alice.post('/release/publish');

		const after = await get('/pages?locale=en');
		expect(after.headers.get('etag')).not.toBe(oldEtag);
		const route = after
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/r/[slug]');
		const slugs = route.entries.map((e: { params: { slug: string } }) => e.params.slug);
		expect(slugs).toContain('b');
	});
});
