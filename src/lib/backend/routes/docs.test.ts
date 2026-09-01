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

const docsPath = (params: Record<string, string>): string => {
	const qs = new URLSearchParams(params).toString();
	return `/docs?${qs}`;
};

describe('GET /docs — validation', () => {
	beforeEach(() => reset());

	it('400s when kind is missing', async () => {
		const res = await get(docsPath({ routeId: '/' }));
		expect(res.status).toBe(400);
	});

	it('400s when kind is invalid', async () => {
		const res = await get(docsPath({ kind: 'something', routeId: '/' }));
		expect(res.status).toBe(400);
	});

	it('400s when routeId is missing', async () => {
		const res = await get(docsPath({ kind: 'page' }));
		expect(res.status).toBe(400);
	});

	it('400s when params is malformed JSON', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '[not json]' }));
		expect(res.status).toBe(400);
	});

	it('400s when params has non-string values', async () => {
		const res = await get(
			docsPath({ kind: 'page', routeId: '/', params: JSON.stringify({ slug: 5 }) })
		);
		expect(res.status).toBe(400);
	});
});

describe('GET /docs — layout fetch', () => {
	beforeEach(() => reset({ layoutDocs: { '/': { footer: { copy: 'F' } } } }));

	it('returns the layout doc when present', async () => {
		const res = await get(docsPath({ kind: 'layout', routeId: '/' }));
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ footer: { copy: 'F' } });
	});

	it('404s when no layout doc exists for the routeId', async () => {
		const res = await get(docsPath({ kind: 'layout', routeId: '/missing' }));
		expect(res.status).toBe(404);
	});
});

describe('GET /docs — page fetch', () => {
	beforeEach(() =>
		reset({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] }
		})
	);

	it('returns the page doc when params match', async () => {
		const res = await get(
			docsPath({ kind: 'page', routeId: '/r/[slug]', params: JSON.stringify({ slug: 'a' }) })
		);
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'A' });
	});

	it('404s when params do not match any entry', async () => {
		const res = await get(
			docsPath({ kind: 'page', routeId: '/r/[slug]', params: JSON.stringify({ slug: 'b' }) })
		);
		expect(res.status).toBe(404);
	});
});

describe('GET /docs — preview overlay', () => {
	const seedReleaseAndGetKey = async (
		tree: Record<string, unknown> = { hero: 'OVERRIDE', metadata: { title: 'New' } }
	): Promise<string> => {
		await fx.alice.post('/release/items', {
			body: {
				items: [{ kind: 'page', routeId: '/r/[slug]', locale: 'en', params: { slug: 'a' }, tree }]
			}
		});
		const release = await fx.alice.get(`/release`);
		return release.json<any>().release.preview_key as string;
	};

	beforeEach(() =>
		reset({
			pageDocs: {
				'/r/[slug]': [
					{
						params: { slug: 'a' },
						published: {
							hero: 'OLD',
							body: 'kept',
							metadata: { title: 'Old', description: 'D' }
						}
					}
				]
			}
		})
	);

	it('deep-merges release tree onto published content when preview key matches', async () => {
		const previewKey = await seedReleaseAndGetKey();
		const res = await get(
			docsPath({
				kind: 'page',
				routeId: '/r/[slug]',
				params: JSON.stringify({ slug: 'a' }),
				preview: previewKey
			})
		);
		expect(res.status).toBe(200);
		expect(res.json<any>().contents.hero).toBe('OVERRIDE');
		expect(res.json<any>().contents.body).toBe('kept');
		expect(res.json<any>().contents.metadata).toEqual({ title: 'New', description: 'D' });
	});

	it('falls through to published content when preview key does not match a release', async () => {
		const res = await get(
			docsPath({
				kind: 'page',
				routeId: '/r/[slug]',
				params: JSON.stringify({ slug: 'a' }),
				preview: 'unknown-key'
			})
		);
		expect(res.status).toBe(200);
		expect(res.json<any>().contents.hero).toBe('OLD');
	});

	it('returns release-only contents (no published doc) when preview key creates a new doc', async () => {
		await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'page',
						routeId: '/r/[slug]',
						locale: 'en',
						params: { slug: 'new' },
						tree: { hero: 'DRAFT' }
					}
				]
			}
		});
		const release = await fx.alice.get(`/release`);
		const previewKey = release.json<any>().release.preview_key;
		const res = await get(
			docsPath({
				kind: 'page',
				routeId: '/r/[slug]',
				params: JSON.stringify({ slug: 'new' }),
				preview: previewKey
			})
		);
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'DRAFT' });
	});
});
