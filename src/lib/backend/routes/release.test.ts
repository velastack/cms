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

describe('GET /release', () => {
	beforeEach(() => reset());

	it('returns null when no release is open', async () => {
		const res = await fx.alice.get('/release');
		expect(res.status).toBe(200);
		expect(res.json<any>().release).toBeNull();
	});

	it('returns the open release after items are added', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { footer: { copy: 'X' } } }]
			}
		});
		const res = await fx.alice.get('/release');
		expect(res.status).toBe(200);
		expect(res.json<any>().release).not.toBeNull();
		expect(res.json<any>().release.items).toHaveLength(1);
	});
});

describe('POST /release/items', () => {
	beforeEach(() => reset());

	it('400s on non-array `items`', async () => {
		const res = await fx.alice.post('/release/items', { body: { items: 'oops' } });
		expect(res.status).toBe(400);
	});

	it('400s on invalid item.kind', async () => {
		const res = await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'banana', routeId: '/', tree: {} }]
			}
		});
		expect(res.status).toBe(400);
	});

	it('400s on missing routeId', async () => {
		const res = await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', tree: {} }]
			}
		});
		expect(res.status).toBe(400);
	});

	it('400s on non-string-record params for a page item', async () => {
		const res = await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 1 },
						tree: { x: 'y' }
					}
				]
			}
		});
		expect(res.status).toBe(400);
	});

	it('adds items and returns the resulting open release', async () => {
		const res = await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { footer: { copy: 'V1' } } }]
			}
		});
		expect(res.status).toBe(200);
		expect(res.json<any>().release.items[0].kind).toBe('layout');
		expect(res.json<any>().release.items[0].tree.footer.copy).toBe('V1');
	});

	it('deep-merges trees when the same scope is edited twice', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { a: 1, b: 2 } }]
			}
		});
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { b: 22, c: 3 } }]
			}
		});
		const res = await fx.alice.get('/release');
		expect(res.json<any>().release.items).toHaveLength(1);
		expect(res.json<any>().release.items[0].tree).toEqual({ a: 1, b: 22, c: 3 });
	});

	it('skips items with empty trees but keeps the release open', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: {} }]
			}
		});
		const res = await fx.alice.get('/release');
		expect(res.json<any>().release).not.toBeNull();
		expect(res.json<any>().release.items).toEqual([]);
	});

	it('400s on invalid JSON body', async () => {
		const res = await fx.alice.post('/release/items', { body: '{not json' });
		expect(res.status).toBe(400);
	});
});

describe('DELETE /release/items', () => {
	beforeEach(async () => {
		await reset();
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } },
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'a' },
						tree: { y: 2 }
					}
				]
			}
		});
	});

	it('removes a layout item', async () => {
		const res = await fx.alice.del('/release/items', {
			body: {
				kind: 'layout',
				routeId: '/',
				locale: 'en'
			}
		});
		expect(res.status).toBe(200);
		expect(res.json<any>().ok).toBe(true);
		const release = await fx.alice.get('/release');
		expect(
			release.json<any>().release.items.find((i: { kind: string }) => i.kind === 'layout')
		).toBeUndefined();
	});

	it('removes a page item by exact params match', async () => {
		await fx.alice.del('/release/items', {
			body: {
				kind: 'page',
				routeId: '/r/[slug]',
				locale: 'en',
				params: { slug: 'a' }
			}
		});
		const release = await fx.alice.get('/release');
		expect(
			release.json<any>().release.items.find((i: { kind: string }) => i.kind === 'page')
		).toBeUndefined();
	});

	it('404s when target is not present', async () => {
		const res = await fx.alice.del('/release/items', {
			body: {
				kind: 'layout',
				routeId: '/nonexistent',
				locale: 'en'
			}
		});
		expect(res.status).toBe(404);
	});

	it('400s on malformed body', async () => {
		const res = await fx.alice.del('/release/items', { body: { kind: 'banana' } });
		expect(res.status).toBe(400);
	});
});

describe('POST /release/discard', () => {
	beforeEach(() => reset());

	it('returns ok=false when nothing to discard', async () => {
		const res = await fx.alice.post('/release/discard');
		expect(res.status).toBe(200);
		expect(res.json<any>().ok).toBe(false);
	});

	it('drops the entire open release when one exists', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const res = await fx.alice.post('/release/discard');
		expect(res.json<any>().ok).toBe(true);
		const release = await fx.alice.get('/release');
		expect(release.json<any>().release).toBeNull();
	});
});

describe('POST /release/preview-key', () => {
	beforeEach(() => reset());

	it('404s when there is no open release', async () => {
		const res = await fx.alice.post('/release/preview-key');
		expect(res.status).toBe(404);
	});

	it('rotates the preview key on the open release', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: 1 } }]
			}
		});
		const before = await fx.alice.get('/release');
		const oldKey = before.json<any>().release.preview_key as string;
		const res = await fx.alice.post('/release/preview-key');
		expect(res.json<any>().preview_key).not.toBe(oldKey);
		const after = await fx.alice.get('/release');
		expect(after.json<any>().release.preview_key).toBe(res.json<any>().preview_key);
	});
});
