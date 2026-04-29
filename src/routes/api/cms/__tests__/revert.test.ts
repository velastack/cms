import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import { __resetStoreForTests, pageDocs, releaseHistory } from '../_store.js';
import { POST as itemsPost } from '../release/items/+server.js';
import { POST as publishPost } from '../release/publish/+server.js';
import { POST as revertPost } from '../release/history/[id]/revert/+server.js';
import { DELETE as pagesDelete, POST as pagesPost } from '../pages/+server.js';

const cookies = { cms_session: 'alice' };
const event = (init: Parameters<typeof makeEvent>[0] = {}) =>
	makeEvent({ ...init, cookies: { ...cookies, ...(init.cookies ?? {}) } });

describe('POST /api/cms/release/history/[id]/revert', () => {
	beforeEach(() => __resetStoreForTests());

	it('404s on a non-existent release id', async () => {
		const response = await revertPost(event({ method: 'POST', params: { id: 'nope' } }));
		expect(response.status).toBe(404);
	});

	it('restores prior values for a layout edit', async () => {
		// Direct seed: pretend layoutDocs['/'] already had 'A'.
		const { layoutDocs } = await import('../_store.js');
		layoutDocs['/'] = { 'footer.copy': 'A' };

		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [{ kind: 'layout', routeId: '/', fields: { 'footer.copy': 'B' } }]
				}
			})
		);
		const publishBody = (await expectJson(await publishPost(event({ method: 'POST' })))) as {
			release: { id: string };
		};
		expect(layoutDocs['/']['footer.copy']).toBe('B');

		await revertPost(event({ method: 'POST', params: { id: publishBody.release.id } }));
		expect(layoutDocs['/']['footer.copy']).toBe('A');
		// Original release record is marked reverted.
		const original = releaseHistory.find((r) => r.id === publishBody.release.id);
		expect(original?.revertedAt).toBeDefined();
		// Revert appended a new history entry.
		expect(releaseHistory).toHaveLength(2);
	});

	it('deletes a page entry when reverting a release that created it', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'a' },
							fields: { hero: 'A' }
						}
					]
				}
			})
		);
		const publishBody = (await expectJson(await publishPost(event({ method: 'POST' })))) as {
			release: { id: string };
		};
		expect(pageDocs['/r/[slug]']).toHaveLength(1);

		await revertPost(event({ method: 'POST', params: { id: publishBody.release.id } }));
		expect(pageDocs['/r/[slug]']).toHaveLength(0);
	});

	it('resurrects a page entry when reverting a page-delete release', async () => {
		// First publish: create the entry.
		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'a' },
							fields: { hero: 'X' }
						}
					]
				}
			})
		);
		await publishPost(event({ method: 'POST' }));
		expect(pageDocs['/r/[slug]']).toHaveLength(1);

		// Stage delete via DELETE /api/cms/pages → publish.
		const delResp = await pagesDelete(
			event({ method: 'DELETE', body: { routeId: '/r/[slug]', params: { slug: 'a' } } })
		);
		const delBody = (await expectJson(delResp)) as { mode: string };
		expect(delBody.mode).toBe('delete-staged');
		const deleteRelease = (await expectJson(await publishPost(event({ method: 'POST' })))) as {
			release: { id: string };
		};
		expect(pageDocs['/r/[slug]']).toHaveLength(0);

		// Revert the delete release.
		await revertPost(event({ method: 'POST', params: { id: deleteRelease.release.id } }));
		expect(pageDocs['/r/[slug]']).toEqual([
			{ params: { slug: 'a' }, published: { hero: 'X' } }
		]);
	});

	it('chains: publish A → publish B → revert A — last-writer-wins', async () => {
		const { layoutDocs } = await import('../_store.js');
		// Release A: set value to v1.
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 'v1' } }] }
			})
		);
		const a = (await expectJson(await publishPost(event({ method: 'POST' })))) as {
			release: { id: string };
		};
		// Release B: set value to v2.
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 'v2' } }] }
			})
		);
		await publishPost(event({ method: 'POST' }));
		expect(layoutDocs['/'].x).toBe('v2');

		// Revert A: restores priorFields snapshot at the time A was published —
		// which was undefined (nothing there before A). The restoreOnto helper
		// deletes keys whose restore value is undefined.
		await revertPost(event({ method: 'POST', params: { id: a.release.id } }));
		expect('x' in layoutDocs['/']).toBe(false);
	});

	it('appends a revert entry whose name references the source release', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const publish = (await expectJson(
			await publishPost(event({ method: 'POST', body: { name: 'Original' } }))
		)) as { release: { id: string } };

		const revertBody = (await expectJson(
			await revertPost(event({ method: 'POST', params: { id: publish.release.id } }))
		)) as { release: { name?: string } };
		expect(revertBody.release.name).toContain('Revert');
		expect(revertBody.release.name).toContain('Original');
	});

	it('returns 400 when [id] route param is missing', async () => {
		const response = await revertPost(event({ method: 'POST', params: {} }));
		expect(response.status).toBe(400);
	});
});

describe('integrating with POST /api/cms/pages — create + revert removes', () => {
	beforeEach(() => __resetStoreForTests());

	it('createPage stages a draft, publish creates entry, revert removes it', async () => {
		await pagesPost(
			event({
				method: 'POST',
				body: { routeId: '/r/[slug]', params: { slug: 'fresh' }, metadata: { title: 'F' } }
			})
		);
		const publishBody = (await expectJson(await publishPost(event({ method: 'POST' })))) as {
			release: { id: string };
		};
		expect(pageDocs['/r/[slug]']?.find((e) => e.params.slug === 'fresh')).toBeDefined();
		await revertPost(event({ method: 'POST', params: { id: publishBody.release.id } }));
		expect(pageDocs['/r/[slug]']?.find((e) => e.params.slug === 'fresh')).toBeUndefined();
	});
});
