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

describe('POST /release/publish', () => {
	beforeEach(() => reset());

	it('404s when there is no open release', async () => {
		const res = await fx.alice.post('/release/publish');
		expect(res.status).toBe(404);
	});

	it('400s when JSON body is malformed', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const res = await fx.alice.post('/release/publish', { body: '{not json' });
		expect(res.status).toBe(400);
	});

	it('publishes a layout edit and writes through to layoutDocs', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { footer: { copy: 'NEW' } } }]
			}
		});
		const res = await fx.alice.post('/release/publish');
		expect(res.status).toBe(200);
		expect(res.json<any>().release.items).toHaveLength(1);
		// Editor ids are opaque now that accounts are real rows, not a two-name mock.
		expect(res.json<any>().release.publishedBy).toBe(fx.users.alice.id);

		const layout = await fx.alice.get('/docs?kind=layout&routeId=/');
		expect(layout.json<any>().contents).toEqual({ footer: { copy: 'NEW' } });

		// Open release was cleared.
		const open = await fx.alice.get('/release');
		expect(open.json<any>().release).toBeNull();

		// History got an entry.
		const history = await fx.alice.get('/release/history');
		expect(history.json<any>().history).toHaveLength(1);
	});

	it('publishes a page edit and creates the entry when none existed', async () => {
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
		await fx.alice.post('/release/publish');

		const doc = await fx.alice.get(
			`/docs?kind=page&routeId=${encodeURIComponent('/r/[slug]')}&params=${encodeURIComponent(
				JSON.stringify({ slug: 'a' })
			)}`
		);
		expect(doc.json<any>().contents).toEqual({ hero: 'A' });

		// priorTree is null because nothing existed before publish.
		const history = await fx.alice.get('/release/history');
		const item = history.json<any>().history[0].items[0];
		expect(item.kind).toBe('page');
		expect(item.priorTree).toBeNull();
	});

	it('captures priorTree on a page edit when an entry already exists', async () => {
		await reset({
			pageDocs: {
				'/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'OLD', body: 'kept' } }]
			}
		});
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'a' },
						tree: { hero: 'NEW' }
					}
				]
			}
		});
		await fx.alice.post('/release/publish');

		const doc = await fx.alice.get(
			`/docs?kind=page&routeId=${encodeURIComponent('/r/[slug]')}&params=${encodeURIComponent(
				JSON.stringify({ slug: 'a' })
			)}`
		);
		expect(doc.json<any>().contents).toEqual({ hero: 'NEW', body: 'kept' });

		const history = await fx.alice.get('/release/history');
		const item = history.json<any>().history[0].items[0];
		expect(item.priorTree).toEqual({ hero: 'OLD' });
	});

	it('honors an optional `name` body parameter', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const res = await fx.alice.post('/release/publish', { body: { name: 'Spring rates' } });
		expect(res.json<any>().release.name).toBe('Spring rates');
	});

	it('400s when name is not a string', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const res = await fx.alice.post('/release/publish', { body: { name: 5 } });
		expect(res.status).toBe(400);
	});
});
