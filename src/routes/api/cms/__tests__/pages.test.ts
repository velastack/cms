import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import { __resetStoreForTests, pageDocs } from '../_store.js';
import { GET as pagesGet, POST as pagesPost, DELETE as pagesDelete } from '../pages/+server.js';
import { POST as itemsPost } from '../release/items/+server.js';
import { POST as publishPost } from '../release/publish/+server.js';

const cookies = { cms_session: 'alice' };
const event = (init: Parameters<typeof makeEvent>[0] = {}) =>
	makeEvent({ ...init, cookies: { ...cookies, ...(init.cookies ?? {}) } });

describe('GET /api/cms/pages', () => {
	beforeEach(() => __resetStoreForTests());

	it('lists every route from the manifest with empty entries when nothing is seeded', async () => {
		const body = (await expectJson(await pagesGet(event()))) as {
			routes: Array<{ routeId: string; ownedParams: string[]; entries: unknown[] }>;
		};
		const ids = body.routes.map((r) => r.routeId);
		// Test manifest has these four routes.
		expect(ids.sort()).toEqual([
			'/',
			'/(app)/dashboard',
			'/(marketing)/about',
			'/(marketing)/rooms/[slug]'
		]);
		const slugRoute = body.routes.find((r) => r.routeId === '/(marketing)/rooms/[slug]')!;
		expect(slugRoute.ownedParams).toEqual(['slug']);
		expect(slugRoute.entries).toEqual([]);
	});

	it('returns published entries from pageDocs, marking neither draft nor delete-pending', async () => {
		pageDocs['/(marketing)/rooms/[slug]'] = [
			{ params: { slug: 'a' }, published: {} },
			{ params: { slug: 'b' }, published: {} }
		];
		const body = (await expectJson(await pagesGet(event()))) as {
			routes: Array<{
				routeId: string;
				entries: { params: Record<string, string>; isDraft: boolean; isDeletePending: boolean }[];
			}>;
		};
		const route = body.routes.find((r) => r.routeId === '/(marketing)/rooms/[slug]')!;
		expect(route.entries).toHaveLength(2);
		expect(route.entries.every((e) => !e.isDraft && !e.isDeletePending)).toBe(true);
	});

	it('flags drafts that exist only in the open release', async () => {
		await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'fresh' } }
			})
		);
		const body = (await expectJson(await pagesGet(event()))) as {
			routes: Array<{
				routeId: string;
				entries: { params: Record<string, string>; isDraft: boolean }[];
			}>;
		};
		const route = body.routes.find((r) => r.routeId === '/(marketing)/rooms/[slug]')!;
		const fresh = route.entries.find((e) => e.params.slug === 'fresh');
		expect(fresh?.isDraft).toBe(true);
	});
});

describe('POST /api/cms/pages', () => {
	beforeEach(() => __resetStoreForTests());

	it('400s on missing routeId', async () => {
		const response = await pagesPost(event({ method: 'POST', body: { params: {} } }));
		expect(response.status).toBe(400);
	});

	it('400s on non-string-record params', async () => {
		const response = await pagesPost(
			event({ method: 'POST', body: { routeId: '/r/[slug]', params: { slug: 1 } } })
		);
		expect(response.status).toBe(400);
	});

	it('400s on non-object metadata', async () => {
		const response = await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/r/[slug]', params: { slug: 'x' }, metadata: 'oops' }
			})
		);
		expect(response.status).toBe(400);
	});

	it('400s on invalid JSON body', async () => {
		const response = await pagesPost(event({ method: 'POST', body: '{not json' }));
		expect(response.status).toBe(400);
	});

	it('creates a draft page item in the open release', async () => {
		const body = (await expectJson(
			await pagesPost(
				event({
					method: 'POST',
					body: {
						routeId: '/(marketing)/rooms/[slug]',
						params: { slug: 'fresh' },
						metadata: { title: 'Fresh' }
					}
				})
			)
		)) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	it('409s when params already exist as a published page', async () => {
		pageDocs['/(marketing)/rooms/[slug]'] = [{ params: { slug: 'taken' }, published: {} }];
		const response = await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'taken' } }
			})
		);
		expect(response.status).toBe(409);
	});

	it('409s when params already exist as a draft in any open release', async () => {
		await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'draft' } }
			})
		);
		// Another user tries the same.
		const response = await pagesPost(
			makeEvent({
				cookies: { cms_session: 'bob' },
				method: 'POST',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'draft' } }
			})
		);
		expect(response.status).toBe(409);
	});
});

describe('DELETE /api/cms/pages', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns mode=draft-discarded when removing a draft (unpublished page)', async () => {
		await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'fresh' } }
			})
		);
		const body = (await expectJson(
			await pagesDelete(
				event({
					method: 'DELETE',
					body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'fresh' } }
				})
			)
		)) as { mode: string };
		expect(body.mode).toBe('draft-discarded');
	});

	it('returns mode=delete-staged when removing a published page', async () => {
		pageDocs['/(marketing)/rooms/[slug]'] = [{ params: { slug: 'pub' }, published: {} }];
		const body = (await expectJson(
			await pagesDelete(
				event({
					method: 'DELETE',
					body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'pub' } }
				})
			)
		)) as { mode: string };
		expect(body.mode).toBe('delete-staged');
		// pageDocs is unchanged until publish.
		expect(pageDocs['/(marketing)/rooms/[slug]']).toHaveLength(1);
	});

	it('actually removes the published entry once the release is published', async () => {
		pageDocs['/(marketing)/rooms/[slug]'] = [{ params: { slug: 'pub' }, published: {} }];
		await pagesDelete(
			event({
				method: 'DELETE',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'pub' } }
			})
		);
		await publishPost(event({ method: 'POST' }));
		expect(pageDocs['/(marketing)/rooms/[slug]']).toHaveLength(0);
	});

	it('404s when there is no draft and no published entry', async () => {
		const response = await pagesDelete(
			event({
				method: 'DELETE',
				body: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'ghost' } }
			})
		);
		expect(response.status).toBe(404);
	});

	it('400s on missing routeId', async () => {
		const response = await pagesDelete(event({ method: 'DELETE', body: { params: {} } }));
		expect(response.status).toBe(400);
	});
});

describe('GET /api/cms/pages — order', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns routes sorted alphabetically by routeId', async () => {
		const body = (await expectJson(await pagesGet(event()))) as {
			routes: { routeId: string }[];
		};
		const ids = body.routes.map((r) => r.routeId);
		const sorted = [...ids].sort();
		expect(ids).toEqual(sorted);
	});
});
