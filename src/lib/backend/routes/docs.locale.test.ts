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

const seedReleaseAndGetKey = async (
	items: Array<Record<string, unknown>>,
	user = 'alice'
): Promise<string> => {
	const res = await as(user).post('/release/items', { body: { items } });
	return (res.json<any>().release as { preview_key: string }).preview_key;
};

/**
 * The cms.velastack server stores docs `[locale][routeId]`. These tests verify
 * that:
 *  - GET /docs returns content matching `?locale=…`, not other locales' content.
 *  - Release-item overlay only applies to items whose `locale` matches the request.
 *  - Cross-locale isolation: `es` edits don't bleed into the `en` view and vice versa.
 */

describe('GET /docs — per-locale published reads', () => {
	beforeEach(() =>
		reset({
			pageDocs: {
				en: { '/': [{ params: {}, published: { hero: 'Hello' } }] },
				es: { '/': [{ params: {}, published: { hero: 'Hola' } }] }
			}
		})
	);

	it('returns the en tree for ?locale=en', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'en' }));
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'Hello' });
	});

	it('returns the es tree for ?locale=es', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'es' }));
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'Hola' });
	});

	it('404s for ?locale=fr (no fr content stored)', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'fr' }));
		expect(res.status).toBe(404);
	});
});

describe('GET /docs — locale-isolated release overlay', () => {
	beforeEach(() =>
		reset({
			pageDocs: {
				en: { '/': [{ params: {}, published: { hero: 'Hello' } }] },
				es: { '/': [{ params: {}, published: { hero: 'Hola' } }] }
			}
		})
	);

	it('items in `es` only overlay the es view', async () => {
		// Bug 2 regression: previously, edits in any locale bled into all locales
		// because `/docs` ignored locale on the items merge.
		const previewKey = await seedReleaseAndGetKey([
			{ kind: 'page', routeId: '/', locale: 'es', params: {}, tree: { hero: 'Hola edited' } }
		]);

		const enRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'en', preview: previewKey })
		);
		expect(enRes.json<any>().contents).toEqual({ hero: 'Hello' }); // unchanged

		const esRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'es', preview: previewKey })
		);
		expect(esRes.json<any>().contents).toEqual({ hero: 'Hola edited' }); // overlaid
	});

	it('items in `en` only overlay the en view', async () => {
		const previewKey = await seedReleaseAndGetKey([
			{ kind: 'page', routeId: '/', locale: 'en', params: {}, tree: { hero: 'Hello edited' } }
		]);

		const enRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'en', preview: previewKey })
		);
		expect(enRes.json<any>().contents).toEqual({ hero: 'Hello edited' });

		const esRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'es', preview: previewKey })
		);
		expect(esRes.json<any>().contents).toEqual({ hero: 'Hola' });
	});

	it('a release with items in both locales overlays each independently', async () => {
		const previewKey = await seedReleaseAndGetKey([
			{ kind: 'page', routeId: '/', locale: 'en', params: {}, tree: { hero: 'EN edit' } },
			{ kind: 'page', routeId: '/', locale: 'es', params: {}, tree: { hero: 'ES edit' } }
		]);

		const enRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'en', preview: previewKey })
		);
		expect(enRes.json<any>().contents).toEqual({ hero: 'EN edit' });

		const esRes = await get(
			docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'es', preview: previewKey })
		);
		expect(esRes.json<any>().contents).toEqual({ hero: 'ES edit' });
	});
});

describe('GET /docs — defaults to DEFAULT_LOCALE when ?locale= missing', () => {
	beforeEach(() =>
		reset({
			pageDocs: {
				en: { '/': [{ params: {}, published: { hero: 'Hello' } }] },
				es: { '/': [{ params: {}, published: { hero: 'Hola' } }] }
			}
		})
	);

	it('omitting ?locale= reads the default (en) bucket', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '{}' }));
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'Hello' });
	});
});

describe('GET /docs — flat seed back-compat', () => {
	beforeEach(() =>
		reset({
			pageDocs: { '/': [{ params: {}, published: { hero: 'Flat' } }] }
		})
	);

	it('flat seed lands under DEFAULT_LOCALE', async () => {
		const res = await get(docsPath({ kind: 'page', routeId: '/', params: '{}', locale: 'en' }));
		expect(res.status).toBe(200);
		expect(res.json<any>().contents).toEqual({ hero: 'Flat' });
	});
});
