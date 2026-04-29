import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import { __resetStoreForTests, openReleases } from '../_store.js';
import { GET as releaseGet } from '../release/+server.js';
import { POST as discardPost } from '../release/discard/+server.js';
import { POST as previewKeyPost } from '../release/preview-key/+server.js';
import { POST as itemsPost, DELETE as itemsDelete } from '../release/items/+server.js';

const cookies = { cms_session: 'alice' };
const event = (init: Parameters<typeof makeEvent>[0] = {}) =>
	makeEvent({ ...init, cookies: { ...cookies, ...(init.cookies ?? {}) } });

describe('GET /api/cms/release', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns null when no release is open', async () => {
		const body = (await expectJson(await releaseGet(event()))) as { release: unknown };
		expect(body.release).toBeNull();
	});

	it('returns the open release after items are added', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { 'footer.copy': 'X' } }] }
			})
		);
		const body = (await expectJson(await releaseGet(event()))) as {
			release: { items: unknown[] };
		};
		expect(body.release).not.toBeNull();
		expect(body.release.items).toHaveLength(1);
	});
});

describe('POST /api/cms/release/items', () => {
	beforeEach(() => __resetStoreForTests());

	it('400s on non-array `items`', async () => {
		const response = await itemsPost(event({ method: 'POST', body: { items: 'oops' } }));
		expect(response.status).toBe(400);
	});

	it('400s on invalid item.kind', async () => {
		const response = await itemsPost(
			event({ method: 'POST', body: { items: [{ kind: 'banana', routeId: '/', fields: {} }] } })
		);
		expect(response.status).toBe(400);
	});

	it('400s on missing routeId', async () => {
		const response = await itemsPost(
			event({ method: 'POST', body: { items: [{ kind: 'layout', fields: {} }] } })
		);
		expect(response.status).toBe(400);
	});

	it('400s on non-string-record params for a page item', async () => {
		const response = await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [
						{ kind: 'page', routeId: '/r/[slug]', params: { slug: 1 }, fields: { x: 'y' } }
					]
				}
			})
		);
		expect(response.status).toBe(400);
	});

	it('adds items and returns the resulting open release', async () => {
		const body = (await expectJson(
			await itemsPost(
				event({
					method: 'POST',
					body: {
						items: [
							{ kind: 'layout', routeId: '/', fields: { 'footer.copy': 'V1' } }
						]
					}
				})
			)
		)) as { release: { items: { kind: string; fields: Record<string, unknown> }[] } };
		expect(body.release.items[0].kind).toBe('layout');
		expect(body.release.items[0].fields['footer.copy']).toBe('V1');
	});

	it('shallow-merges fields when the same scope is edited twice', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { a: 1, b: 2 } }] }
			})
		);
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { b: 22, c: 3 } }] }
			})
		);
		const release = openReleases.alice;
		expect(release.items).toHaveLength(1);
		expect(release.items[0].kind === 'layout' && release.items[0].fields).toEqual({
			a: 1,
			b: 22,
			c: 3
		});
	});

	it('skips items with empty fields (line 271 in _store.ts)', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: {} }] }
			})
		);
		// The release is created (ensureOpenRelease runs first) but the
		// empty-fields item is skipped, so items stays []. This documents the
		// asymmetry: empty fields don't drop the release, just don't add an
		// item to it.
		expect(openReleases.alice).toBeDefined();
		expect(openReleases.alice.items).toEqual([]);
	});

	it('400s on invalid JSON body', async () => {
		const response = await itemsPost(event({ method: 'POST', body: '{not json' }));
		expect(response.status).toBe(400);
	});
});

describe('DELETE /api/cms/release/items', () => {
	beforeEach(() => __resetStoreForTests());

	const seedRelease = async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [
						{ kind: 'layout', routeId: '/', fields: { x: 1 } },
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'a' },
							fields: { y: 2 }
						}
					]
				}
			})
		);
	};

	it('removes a layout item', async () => {
		await seedRelease();
		const body = (await expectJson(
			await itemsDelete(event({ method: 'DELETE', body: { kind: 'layout', routeId: '/' } }))
		)) as { ok: boolean };
		expect(body.ok).toBe(true);
		expect(openReleases.alice.items.find((i) => i.kind === 'layout')).toBeUndefined();
	});

	it('removes a page item by exact params match', async () => {
		await seedRelease();
		await itemsDelete(
			event({
				method: 'DELETE',
				body: { kind: 'page', routeId: '/r/[slug]', params: { slug: 'a' } }
			})
		);
		expect(openReleases.alice.items.find((i) => i.kind === 'page')).toBeUndefined();
	});

	it('404s when target is not present', async () => {
		await seedRelease();
		const response = await itemsDelete(
			event({ method: 'DELETE', body: { kind: 'layout', routeId: '/nonexistent' } })
		);
		expect(response.status).toBe(404);
	});

	it('400s on malformed body', async () => {
		await seedRelease();
		const response = await itemsDelete(event({ method: 'DELETE', body: { kind: 'banana' } }));
		expect(response.status).toBe(400);
	});
});

describe('POST /api/cms/release/discard', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns ok=false when nothing to discard', async () => {
		const body = (await expectJson(await discardPost(event({ method: 'POST' })))) as {
			ok: boolean;
		};
		expect(body.ok).toBe(false);
	});

	it('drops the entire open release when one exists', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const body = (await expectJson(await discardPost(event({ method: 'POST' })))) as {
			ok: boolean;
		};
		expect(body.ok).toBe(true);
		expect(openReleases.alice).toBeUndefined();
	});
});

describe('POST /api/cms/release/preview-key', () => {
	beforeEach(() => __resetStoreForTests());

	it('404s when there is no open release', async () => {
		const response = await previewKeyPost(event({ method: 'POST' }));
		expect(response.status).toBe(404);
	});

	it('rotates the preview key on the open release', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const old = openReleases.alice.preview_key;
		const body = (await expectJson(await previewKeyPost(event({ method: 'POST' })))) as {
			preview_key: string;
		};
		expect(body.preview_key).not.toBe(old);
		expect(openReleases.alice.preview_key).toBe(body.preview_key);
	});
});
