import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';
import type { CmsSeed, SeedResponse } from '../../core/wire.js';

let fx: TestFixture;

beforeEach(async () => {
	fx = await createTestFixture();
	await fx.backend.testing.reset('p1');
});

const SEED: CmsSeed = {
	layouts: {
		en: {
			'/': { branding: { name: 'Alcove' }, hours: { v: 1, note: 'Closed Sundays', days: [] } }
		},
		es: { '/': { hours: { $t: { _: { note: 'Cerrado los domingos' } } } } }
	},
	pages: {
		en: {
			'/(public)/about': { hero: { title: 'About us' } },
			'/(public)/rooms/[slug]': [
				{ params: { slug: 'suite' }, published: { hero: { title: 'The suite' } } }
			]
		},
		es: { '/(public)/about': { hero: { title: 'Sobre nosotros' } } }
	},
	site: { schemaType: 'LocalBusiness', shareImage: 'https://cdn.example/og.jpg' }
};

describe('POST /seed', () => {
	it('403s anonymous callers', async () => {
		const res = await fx.anon.post('/seed', { body: SEED });
		expect(res.status).toBe(403);
	});

	it('400s a malformed body', async () => {
		const res = await fx.alice.post('/seed', { body: { layouts: { en: { about: {} } } } });
		expect(res.status).toBe(400);
		expect(res.text).toContain('not a route id');
	});

	it('seeds layouts, pages and site per locale, readable through /docs and /site', async () => {
		const res = await fx.alice.post('/seed', { body: SEED });
		expect(res.status).toBe(200);
		expect(res.json<SeedResponse>()).toEqual({
			ok: true,
			seeded: { locales: ['en', 'es'], layouts: 2, pages: 3, site: true }
		});

		const layout = await fx.anon.get('/docs?kind=layout&routeId=/&locale=en');
		expect(layout.json<any>().contents.branding.name).toBe('Alcove');

		const esLayout = await fx.anon.get('/docs?kind=layout&routeId=/&locale=es');
		expect(esLayout.json<any>().contents.hours.$t._.note).toBe('Cerrado los domingos');

		const about = await fx.anon.get(
			'/docs?kind=page&routeId=' + encodeURIComponent('/(public)/about') + '&params={}&locale=es'
		);
		expect(about.json<any>().contents.hero.title).toBe('Sobre nosotros');

		const suite = await fx.anon.get(
			'/docs?kind=page&routeId=' +
				encodeURIComponent('/(public)/rooms/[slug]') +
				'&params=' +
				encodeURIComponent('{"slug":"suite"}') +
				'&locale=en'
		);
		expect(suite.json<any>().contents.hero.title).toBe('The suite');

		const site = await fx.anon.get('/site');
		expect(site.json<any>().contents.schemaType).toBe('LocalBusiness');
	});

	it('refuses to seed a project that already has published rows', async () => {
		await fx.alice.post('/seed', { body: SEED });
		const again = await fx.alice.post('/seed', {
			body: { layouts: { en: { '/': { branding: { name: 'Other' } } } } }
		});
		expect(again.status).toBe(409);
		expect(again.json<SeedResponse>()).toEqual({ ok: false, reason: 'already-seeded' });
		const layout = await fx.anon.get('/docs?kind=layout&routeId=/&locale=en');
		expect(layout.json<any>().contents.branding.name).toBe('Alcove');
	});

	it('refuses after content was published through a release, too', async () => {
		await fx.alice.post('/release/items', {
			body: { items: [{ kind: 'site', tree: { schemaType: 'Restaurant' } }] }
		});
		await fx.alice.post('/release/publish', { body: {} });
		const res = await fx.alice.post('/seed', { body: SEED });
		expect(res.status).toBe(409);
	});

	it('overwrites named rows with force and invalidates cached reads', async () => {
		await fx.alice.post('/seed', { body: SEED });
		const before = await fx.anon.get('/docs?kind=layout&routeId=/&locale=en');
		const etag = before.headers.get('etag');
		const res = await fx.alice.post('/seed', {
			body: { force: true, layouts: { en: { '/': { branding: { name: 'Forced' } } } } }
		});
		expect(res.status).toBe(200);
		const after = await fx.anon.get('/docs?kind=layout&routeId=/&locale=en');
		expect(after.json<any>().contents.branding.name).toBe('Forced');
		expect(after.headers.get('etag')).not.toBe(etag);
		// Rows the forced seed did not name are untouched.
		const site = await fx.anon.get('/site');
		expect(site.json<any>().contents.schemaType).toBe('LocalBusiness');
	});
});

describe('GET /export', () => {
	it('403s anonymous callers', async () => {
		const res = await fx.anon.get('/export');
		expect(res.status).toBe(403);
	});

	it('returns the seed shape and round-trips into a fresh project', async () => {
		await fx.alice.post('/seed', { body: SEED });
		const res = await fx.alice.get('/export');
		expect(res.status).toBe(200);
		const exported = res.json<CmsSeed>();
		expect(exported.layouts).toEqual(SEED.layouts);
		expect(exported.site).toEqual(SEED.site);
		// Bare page trees come back as one-entry lists with empty params.
		expect(exported.pages!.en['/(public)/about']).toEqual([
			{ params: {}, published: { hero: { title: 'About us' } } }
		]);
		expect(exported.pages!.en['/(public)/rooms/[slug]']).toEqual(
			SEED.pages!.en['/(public)/rooms/[slug]']
		);

		const other = fx.at('p_alice', fx.alice);
		const seeded = await other.post('/seed', { body: exported });
		expect(seeded.status).toBe(200);
		const back = await other.get('/export');
		expect(back.json<CmsSeed>()).toEqual(exported);
	});

	it('omits tombstoned pages', async () => {
		await fx.alice.post('/seed', {
			body: {
				pages: {
					en: {
						'/(public)/rooms/[slug]': [
							{ params: { slug: 'gone' }, published: {}, tombstone: { kind: 'gone' } },
							{ params: { slug: 'kept' }, published: { hero: { title: 'Kept' } } }
						]
					}
				}
			}
		});
		const res = await fx.alice.get('/export');
		expect(res.json<CmsSeed>().pages!.en['/(public)/rooms/[slug]']).toEqual([
			{ params: { slug: 'kept' }, published: { hero: { title: 'Kept' } } }
		]);
	});

	it('in-process store.seed reports already-seeded without touching rows', () => {
		const store = fx.backend.store;
		expect(store.seed('p1', SEED)).toMatchObject({ ok: true });
		expect(store.seed('p1', { site: { schemaType: 'Hotel' } })).toEqual({
			ok: false,
			reason: 'already-seeded'
		});
		expect(store.exportPublished('p1').site).toEqual(SEED.site);
	});
});
