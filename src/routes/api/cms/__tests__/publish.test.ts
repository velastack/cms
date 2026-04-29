import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import {
	__resetStoreForTests,
	layoutDocs,
	openReleases,
	pageDocs,
	releaseHistory
} from '../_store.js';
import { POST as itemsPost } from '../release/items/+server.js';
import { POST as publishPost } from '../release/publish/+server.js';

const cookies = { cms_session: 'alice' };
const event = (init: Parameters<typeof makeEvent>[0] = {}) =>
	makeEvent({ ...init, cookies: { ...cookies, ...(init.cookies ?? {}) } });

describe('POST /api/cms/release/publish', () => {
	beforeEach(() => __resetStoreForTests());

	it('404s when there is no open release', async () => {
		const response = await publishPost(event({ method: 'POST' }));
		expect(response.status).toBe(404);
	});

	it('400s when JSON body is malformed', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const response = await publishPost(event({ method: 'POST', body: '{not json' }));
		expect(response.status).toBe(400);
	});

	it('publishes a layout edit and writes through to layoutDocs', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [{ kind: 'layout', routeId: '/', fields: { 'footer.copy': 'NEW' } }]
				}
			})
		);
		const response = await publishPost(event({ method: 'POST' }));
		const body = (await expectJson(response)) as {
			release: { items: unknown[]; publishedBy: string };
		};
		expect(body.release.items).toHaveLength(1);
		expect(body.release.publishedBy).toBe('alice');
		expect(layoutDocs['/']).toEqual({ 'footer.copy': 'NEW' });
		expect(openReleases.alice).toBeUndefined();
		expect(releaseHistory).toHaveLength(1);
	});

	it('publishes a page edit and creates the entry when none existed', async () => {
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
		await publishPost(event({ method: 'POST' }));
		expect(pageDocs['/r/[slug]']).toEqual([
			{ params: { slug: 'a' }, published: { hero: 'A' } }
		]);
		// priorFields is null because nothing existed before publish.
		const item = releaseHistory[0].items[0];
		expect(item.kind === 'page' && item.priorFields).toBeNull();
	});

	it('captures priorFields on a page edit when an entry already exists', async () => {
		// Seed a published entry directly.
		pageDocs['/r/[slug]'] = [
			{ params: { slug: 'a' }, published: { hero: 'OLD', body: 'kept' } }
		];
		await itemsPost(
			event({
				method: 'POST',
				body: {
					items: [
						{
							kind: 'page',
							routeId: '/r/[slug]',
							params: { slug: 'a' },
							fields: { hero: 'NEW' }
						}
					]
				}
			})
		);
		await publishPost(event({ method: 'POST' }));
		expect(pageDocs['/r/[slug]'][0].published).toEqual({ hero: 'NEW', body: 'kept' });
		const item = releaseHistory[0].items[0];
		expect(item.kind === 'page' && item.priorFields).toEqual({ hero: 'OLD' });
	});

	it('honors an optional `name` body parameter', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const body = (await expectJson(
			await publishPost(event({ method: 'POST', body: { name: 'Spring rates' } }))
		)) as { release: { name?: string } };
		expect(body.release.name).toBe('Spring rates');
	});

	it('400s when name is not a string', async () => {
		await itemsPost(
			event({
				method: 'POST',
				body: { items: [{ kind: 'layout', routeId: '/', fields: { x: 1 } }] }
			})
		);
		const response = await publishPost(event({ method: 'POST', body: { name: 5 } }));
		expect(response.status).toBe(400);
	});
});
