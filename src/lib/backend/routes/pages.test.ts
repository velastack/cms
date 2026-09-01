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

describe('GET /pages', () => {
	beforeEach(() => reset());

	it('returns an empty list when nothing is seeded', async () => {
		const res = await fx.alice.get('/pages');
		expect(res.status).toBe(200);
		expect(res.json<any>().routes).toEqual([]);
	});

	it('returns published entries to unauthenticated callers (no draft state)', async () => {
		await reset({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [
					{ params: { slug: 'a' }, published: {} },
					{ params: { slug: 'b' }, published: {} }
				]
			}
		});
		// Authed user stages a draft for a NEW slug.
		await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'fresh' }
			}
		});

		const res = await get('/pages');
		expect(res.status).toBe(200);
		const route = res
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/(marketing)/rooms/[slug]');
		// Only published entries; the draft 'fresh' is invisible to unauthed.
		expect(route.entries.map((e: { params: { slug: string } }) => e.params.slug).sort()).toEqual([
			'a',
			'b'
		]);
		expect(
			route.entries.every(
				(e: { isDraft: boolean; isDeletePending: boolean }) => !e.isDraft && !e.isDeletePending
			)
		).toBe(true);
	});

	it('lists routes derived from seeded pageDocs with empty draft state', async () => {
		await reset({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [
					{ params: { slug: 'a' }, published: {} },
					{ params: { slug: 'b' }, published: {} }
				]
			}
		});
		const res = await fx.alice.get('/pages');
		expect(res.status).toBe(200);
		const route = res
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/(marketing)/rooms/[slug]');
		expect(route).toBeDefined();
		expect(route.ownedParams).toEqual(['slug']);
		expect(route.entries).toHaveLength(2);
		expect(
			route.entries.every(
				(e: { isDraft: boolean; isDeletePending: boolean }) => !e.isDraft && !e.isDeletePending
			)
		).toBe(true);
	});

	it('flags drafts that exist only in the open release', async () => {
		await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'fresh' }
			}
		});
		const res = await fx.alice.get('/pages');
		const route = res
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/(marketing)/rooms/[slug]');
		const fresh = route.entries.find(
			(e: { params: Record<string, string> }) => e.params.slug === 'fresh'
		);
		expect(fresh.isDraft).toBe(true);
	});

	it('returns routes sorted alphabetically by routeId', async () => {
		await reset({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [{ params: { slug: 'a' }, published: {} }],
				'/(marketing)/about': [{ params: {}, published: {} }],
				'/': [{ params: {}, published: {} }]
			}
		});
		const res = await fx.alice.get('/pages');
		const ids = res.json<any>().routes.map((r: { routeId: string }) => r.routeId);
		expect(ids).toEqual([...ids].sort());
	});
});

describe('POST /pages', () => {
	beforeEach(() => reset());

	it('400s on missing routeId', async () => {
		const res = await fx.alice.post('/pages', { body: { params: {} } });
		expect(res.status).toBe(400);
	});

	it('400s on non-string-record params', async () => {
		const res = await fx.alice.post('/pages', {
			body: { routeId: '/r/[slug]', params: { slug: 1 } }
		});
		expect(res.status).toBe(400);
	});

	it('400s on non-object metadata', async () => {
		const res = await fx.alice.post('/pages', {
			body: {
				routeId: '/r/[slug]',
				params: { slug: 'x' },
				metadata: 'oops'
			}
		});
		expect(res.status).toBe(400);
	});

	it('400s on invalid JSON body', async () => {
		const res = await fx.alice.post('/pages', { body: '{not json' });
		expect(res.status).toBe(400);
	});

	it('creates a draft page item in the open release', async () => {
		const res = await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'fresh' },
				metadata: { title: 'Fresh' }
			}
		});
		expect(res.status).toBe(200);
		expect(res.json<any>().ok).toBe(true);
	});

	it('409s when params already exist as a published page', async () => {
		await reset({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [{ params: { slug: 'taken' }, published: {} }]
			}
		});
		const res = await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'taken' }
			}
		});
		expect(res.status).toBe(409);
	});

	it('409s when params already exist as a draft in any open release', async () => {
		await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'draft' }
			}
		});
		// Another user tries the same.
		const res = await fx.bob.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'draft' }
			}
		});
		expect(res.status).toBe(409);
	});
});

describe('DELETE /pages', () => {
	beforeEach(() => reset());

	it('returns mode=draft-discarded when removing a draft (unpublished page)', async () => {
		await fx.alice.post('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'fresh' }
			}
		});
		const res = await fx.alice.del('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'fresh' }
			}
		});
		expect(res.status).toBe(200);
		expect(res.json<any>().mode).toBe('draft-discarded');
	});

	it('returns mode=delete-staged when removing a published page', async () => {
		await reset({
			pageDocs: { '/(marketing)/rooms/[slug]': [{ params: { slug: 'pub' }, published: {} }] }
		});
		const res = await fx.alice.del('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'pub' }
			}
		});
		expect(res.status).toBe(200);
		expect(res.json<any>().mode).toBe('delete-staged');

		// pageDocs is unchanged until publish — verify via /pages listing.
		const list = await fx.alice.get('/pages');
		const route = list
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/(marketing)/rooms/[slug]');
		expect(route.entries).toHaveLength(1);
		expect(route.entries[0].isDeletePending).toBe(true);
	});

	it('actually removes the published entry once the release is published', async () => {
		await reset({
			pageDocs: { '/(marketing)/rooms/[slug]': [{ params: { slug: 'pub' }, published: {} }] }
		});
		await fx.alice.del('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'pub' }
			}
		});
		await fx.alice.post('/release/publish');

		const list = await fx.alice.get('/pages');
		const route = list
			.json<any>()
			.routes.find((r: { routeId: string }) => r.routeId === '/(marketing)/rooms/[slug]');
		// The route disappears when no entries remain (collectPageRoutes union).
		expect(route?.entries ?? []).toHaveLength(0);
	});

	it('404s when there is no draft and no published entry', async () => {
		const res = await fx.alice.del('/pages', {
			body: {
				routeId: '/(marketing)/rooms/[slug]',
				locale: 'en',
				params: { slug: 'ghost' }
			}
		});
		expect(res.status).toBe(404);
	});

	it('400s on missing routeId', async () => {
		const res = await fx.alice.del('/pages', { body: { params: {} } });
		expect(res.status).toBe(400);
	});
});
