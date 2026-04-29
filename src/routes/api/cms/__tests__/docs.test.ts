import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import { __resetStoreForTests, layoutDocs, openReleases, pageDocs } from '../_store.js';
import { GET as docsGet } from '../docs/+server.js';
import { POST as itemsPost } from '../release/items/+server.js';

const cookies = { cms_session: 'alice' };

const docsUrl = (params: Record<string, string>): string => {
	const qs = new URLSearchParams(params).toString();
	return `http://localhost/api/cms/docs?${qs}`;
};

describe('GET /api/cms/docs — validation', () => {
	beforeEach(() => __resetStoreForTests());

	it('400s when kind is missing', async () => {
		const response = await docsGet(makeEvent({ url: docsUrl({ routeId: '/' }) }));
		expect(response.status).toBe(400);
	});

	it('400s when kind is invalid', async () => {
		const response = await docsGet(
			makeEvent({ url: docsUrl({ kind: 'something', routeId: '/' }) })
		);
		expect(response.status).toBe(400);
	});

	it('400s when routeId is missing', async () => {
		const response = await docsGet(makeEvent({ url: docsUrl({ kind: 'page' }) }));
		expect(response.status).toBe(400);
	});

	it('400s when params is malformed JSON', async () => {
		const response = await docsGet(
			makeEvent({ url: docsUrl({ kind: 'page', routeId: '/', params: '[not json]' }) })
		);
		expect(response.status).toBe(400);
	});

	it('400s when params has non-string values', async () => {
		const response = await docsGet(
			makeEvent({
				url: docsUrl({ kind: 'page', routeId: '/', params: JSON.stringify({ slug: 5 }) })
			})
		);
		expect(response.status).toBe(400);
	});
});

describe('GET /api/cms/docs — layout fetch', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns the layout doc when present', async () => {
		layoutDocs['/'] = { 'footer.copy': 'F' };
		const body = (await expectJson(
			await docsGet(makeEvent({ url: docsUrl({ kind: 'layout', routeId: '/' }) }))
		)) as { contents: Record<string, unknown> };
		expect(body.contents).toEqual({ 'footer.copy': 'F' });
	});

	it('404s when no layout doc exists for the routeId', async () => {
		const response = await docsGet(
			makeEvent({ url: docsUrl({ kind: 'layout', routeId: '/missing' }) })
		);
		expect(response.status).toBe(404);
	});
});

describe('GET /api/cms/docs — page fetch', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns the page doc when params match', async () => {
		pageDocs['/r/[slug]'] = [{ params: { slug: 'a' }, published: { hero: 'A' } }];
		const body = (await expectJson(
			await docsGet(
				makeEvent({
					url: docsUrl({
						kind: 'page',
						routeId: '/r/[slug]',
						params: JSON.stringify({ slug: 'a' })
					})
				})
			)
		)) as { contents: Record<string, unknown> };
		expect(body.contents).toEqual({ hero: 'A' });
	});

	it('404s when params do not match any entry', async () => {
		pageDocs['/r/[slug]'] = [{ params: { slug: 'a' }, published: { hero: 'A' } }];
		const response = await docsGet(
			makeEvent({
				url: docsUrl({
					kind: 'page',
					routeId: '/r/[slug]',
					params: JSON.stringify({ slug: 'b' })
				})
			})
		);
		expect(response.status).toBe(404);
	});
});

describe('GET /api/cms/docs — preview overlay', () => {
	beforeEach(() => __resetStoreForTests());

	const seedReleaseAndGetKey = async (): Promise<string> => {
		await itemsPost(
			makeEvent({
				cookies,
				method: 'POST',
				body: {
					items: [
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'a' },
							fields: { hero: 'OVERRIDE', _metadata: { title: 'New' } }
						}
					]
				}
			})
		);
		return openReleases.alice.preview_key;
	};

	it('overlays release fields onto published content when preview key matches', async () => {
		pageDocs['/r/[slug]'] = [
			{
				params: { slug: 'a' },
				published: { hero: 'OLD', body: 'kept', _metadata: { title: 'Old', description: 'D' } }
			}
		];
		const previewKey = await seedReleaseAndGetKey();
		const body = (await expectJson(
			await docsGet(
				makeEvent({
					url: docsUrl({
						kind: 'page',
						routeId: '/r/[slug]',
						params: JSON.stringify({ slug: 'a' }),
						preview: previewKey
					})
				})
			)
		)) as { contents: Record<string, unknown> };
		expect(body.contents.hero).toBe('OVERRIDE');
		expect(body.contents.body).toBe('kept');
		expect(body.contents._metadata).toEqual({ title: 'New', description: 'D' });
	});

	it('falls through to published content when preview key does not match a release', async () => {
		pageDocs['/r/[slug]'] = [{ params: { slug: 'a' }, published: { hero: 'OLD' } }];
		const body = (await expectJson(
			await docsGet(
				makeEvent({
					url: docsUrl({
						kind: 'page',
						routeId: '/r/[slug]',
						params: JSON.stringify({ slug: 'a' }),
						preview: 'unknown-key'
					})
				})
			)
		)) as { contents: Record<string, unknown> };
		expect(body.contents).toEqual({ hero: 'OLD' });
	});

	it('returns release-only contents (no published doc) when preview key creates a new doc', async () => {
		// No published entry for slug=new, but release has page-create draft for it.
		await itemsPost(
			makeEvent({
				cookies,
				method: 'POST',
				body: {
					items: [
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'new' },
							fields: { hero: 'DRAFT' }
						}
					]
				}
			})
		);
		const previewKey = openReleases.alice.preview_key;
		const body = (await expectJson(
			await docsGet(
				makeEvent({
					url: docsUrl({
						kind: 'page',
						routeId: '/r/[slug]',
						params: JSON.stringify({ slug: 'new' }),
						preview: previewKey
					})
				})
			)
		)) as { contents: Record<string, unknown> };
		expect(body.contents).toEqual({ hero: 'DRAFT' });
	});
});
