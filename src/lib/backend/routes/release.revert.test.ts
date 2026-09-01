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

const docPath = (routeId: string, params: Record<string, string>) =>
	`/docs?kind=page&routeId=${encodeURIComponent(routeId)}&params=${encodeURIComponent(
		JSON.stringify(params)
	)}`;

const layoutPath = (routeId: string) => `/docs?kind=layout&routeId=${encodeURIComponent(routeId)}`;

describe('POST /release/history/[id]/revert', () => {
	beforeEach(() => reset());

	it('404s on a non-existent release id', async () => {
		const res = await fx.alice.post(`/release/history/nope/revert`);
		expect(res.status).toBe(404);
	});

	it('restores prior values for a layout edit', async () => {
		await reset({ layoutDocs: { '/': { footer: { copy: 'A' } } } });

		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { footer: { copy: 'B' } } }]
			}
		});
		const publish = await fx.alice.post('/release/publish');
		const releaseId = publish.json<any>().release.id as string;

		const after = await fx.alice.get(layoutPath('/'));
		expect(after.json<any>().contents.footer.copy).toBe('B');

		await fx.alice.post(`/release/history/${releaseId}/revert`);

		const reverted = await fx.alice.get(layoutPath('/'));
		expect(reverted.json<any>().contents.footer.copy).toBe('A');

		const history = await fx.alice.get('/release/history');
		const original = history.json<any>().history.find((r: { id: string }) => r.id === releaseId);
		expect(original.revertedAt).toBeDefined();
		expect(history.json<any>().history).toHaveLength(2);
	});

	it('deletes a page entry when reverting a release that created it', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'a' },
						tree: { hero: 'A' }
					}
				]
			}
		});
		const publish = await fx.alice.post('/release/publish');
		const releaseId = publish.json<any>().release.id;

		const before = await fx.alice.get(docPath('/r/[slug]', { slug: 'a' }));
		expect(before.status).toBe(200);

		await fx.alice.post(`/release/history/${releaseId}/revert`);

		const after = await fx.alice.get(docPath('/r/[slug]', { slug: 'a' }));
		expect(after.status).toBe(404);
	});

	it('resurrects a page entry when reverting a page-delete release', async () => {
		// First publish: create the entry.
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'a' },
						tree: { hero: 'X' }
					}
				]
			}
		});
		await fx.alice.post('/release/publish');

		// Stage delete via DELETE /pages → publish.
		const del = await fx.alice.del('/pages', {
			body: {
				routeId: '/r/[slug]',
				locale: 'en',
				params: { slug: 'a' }
			}
		});
		expect(del.json<any>().mode).toBe('delete-staged');
		const deleteRelease = await fx.alice.post('/release/publish');
		const gone = await fx.alice.get(docPath('/r/[slug]', { slug: 'a' }));
		expect(gone.status).toBe(404);

		// Revert the delete release.
		await fx.alice.post(`/release/history/${deleteRelease.json<any>().release.id}/revert`);

		const back = await fx.alice.get(docPath('/r/[slug]', { slug: 'a' }));
		expect(back.status).toBe(200);
		expect(back.json<any>().contents).toEqual({ hero: 'X' });
	});

	it('chains: publish A → publish B → revert A — last-writer-wins', async () => {
		// Release A: set value to v1.
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 'v1' } }]
			}
		});
		const a = await fx.alice.post('/release/publish');

		// Release B: set value to v2.
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 'v2' } }]
			}
		});
		await fx.alice.post('/release/publish');

		const after = await fx.alice.get(layoutPath('/'));
		expect(after.json<any>().contents.x).toBe('v2');

		// Revert A: restores priorTree snapshot at time of A's publish (undefined).
		// restoreOnto deletes keys whose restore value is undefined.
		await fx.alice.post(`/release/history/${a.json<any>().release.id}/revert`);

		const reverted = await fx.alice.get(layoutPath('/'));
		expect(reverted.json<any>().contents).not.toHaveProperty('x');
	});

	it('appends a revert entry whose name references the source release', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const publish = await fx.alice.post('/release/publish', { body: { name: 'Original' } });

		const revert = await fx.alice.post(`/release/history/${publish.json<any>().release.id}/revert`);
		expect(revert.json<any>().release.name).toContain('Revert');
		expect(revert.json<any>().release.name).toContain('Original');
	});
});

describe('integrating with POST /pages — create + revert removes', () => {
	beforeEach(() => reset());

	it('createPage stages a draft, publish creates entry, revert removes it', async () => {
		await fx.alice.post('/pages', {
			body: {
				routeId: '/r/[slug]',
				locale: 'en',
				params: { slug: 'fresh' },
				metadata: { title: 'F' }
			}
		});
		const publish = await fx.alice.post('/release/publish');

		const before = await fx.alice.get(docPath('/r/[slug]', { slug: 'fresh' }));
		expect(before.status).toBe(200);

		await fx.alice.post(`/release/history/${publish.json<any>().release.id}/revert`);

		const after = await fx.alice.get(docPath('/r/[slug]', { slug: 'fresh' }));
		expect(after.status).toBe(404);
	});
});
