/**
 * The managed company profile: `createCmsBackend({ company })` lays the
 * host's value over `/site` reads, keeps it out of writes, and never serves
 * it stale.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';
import type { CmsManagedCompany } from '../types.js';

type Site = { contents: Record<string, any> };

let fx: TestFixture;
let managed: CmsManagedCompany | null;
let seen: string[];

beforeEach(async () => {
	managed = { value: { name: 'Casa Vela', locations: [{ id: 'main' }] }, by: 'VelaBase' };
	seen = [];
	fx = await createTestFixture({
		backend: {
			company: {
				resolve: (projectId) => {
					seen.push(projectId);
					return managed;
				}
			}
		}
	});
	await fx.backend.testing.reset('p1');
});

const publishSite = async (tree: Record<string, unknown>) => {
	await fx.alice.post('/release/items', { body: { items: [{ kind: 'site', tree }] } });
	return fx.alice.post('/release/publish');
};

describe('GET /site with a managed company', () => {
	it('serves the normalized company and the marker over the stored tree', async () => {
		await publishSite({ seo: { schemaType: 'Hotel' } });
		const site = (await fx.anon.get('/site')).json<Site>().contents;
		expect(site.seo).toEqual({ schemaType: 'Hotel' });
		expect(site.company).toMatchObject({ v: 1, name: 'Casa Vela', legalName: '' });
		expect(site.company.locations[0]).toMatchObject({ id: 'main', geo: null });
		expect(site.$managed).toEqual({ company: { by: 'VelaBase' } });
		expect(seen).toContain('p1');
	});

	it('carries the manager url, and overlays previews and versions too', async () => {
		managed = { ...managed!, url: 'https://velabase.example/p1/company' };
		const marker = { company: { by: 'VelaBase', url: 'https://velabase.example/p1/company' } };

		const published = (await publishSite({ seo: { schemaType: 'Hotel' } })).json<any>().release;
		const version = await fx.anon.get(`/site?version=${published.preview_key}`);
		expect(version.json<Site>().contents).toMatchObject({ $managed: marker, seo: {} });
		expect(version.headers.get('cache-control') ?? '').not.toContain('immutable');

		const open = await fx.alice.post('/release/items', {
			body: { items: [{ kind: 'site', tree: { seo: { schemaType: 'Restaurant' } } }] }
		});
		const preview = await fx.anon.get(`/site?preview=${open.json<any>().release.preview_key}`);
		expect(preview.json<Site>().contents).toMatchObject({
			$managed: marker,
			seo: { schemaType: 'Restaurant' },
			company: { name: 'Casa Vela' }
		});
	});

	it('follows the host without a publish: new body, new validator, no stale 304', async () => {
		const first = await fx.anon.get('/site');
		const etag = first.headers.get('etag')!;
		expect((await fx.anon.get('/site', { headers: { 'if-none-match': etag } })).status).toBe(304);

		managed = { ...managed!, value: { name: 'Casa Marea' } };
		const second = await fx.anon.get('/site', { headers: { 'if-none-match': etag } });
		expect(second.status).toBe(200);
		expect(second.headers.get('etag')).not.toBe(etag);
		expect(second.json<Site>().contents.company.name).toBe('Casa Marea');
	});

	it('hands the profile back to the CMS when the host stops managing it', async () => {
		await fx.anon.get('/site');
		managed = null;
		const site = (await fx.anon.get('/site')).json<Site>().contents;
		expect(site).toEqual({});
	});
});

describe('site writes with a managed company', () => {
	it('drops company and $managed from a site release item', async () => {
		const res = await fx.alice.post('/release/items', {
			body: {
				items: [
					{
						kind: 'site',
						tree: {
							seo: { schemaType: 'Hotel' },
							company: { name: 'Mine' },
							$managed: { company: { by: 'Me' } }
						}
					}
				]
			}
		});
		expect(res.json<any>().release.items[0].tree).toEqual({ seo: { schemaType: 'Hotel' } });

		await fx.alice.post('/release/publish');
		managed = null;
		expect((await fx.anon.get('/site')).json<Site>().contents).toEqual({
			seo: { schemaType: 'Hotel' }
		});
	});

	it('stores no site item at all when company was the only change', async () => {
		const res = await fx.alice.post('/release/items', {
			body: { items: [{ kind: 'site', tree: { company: { name: 'Mine' } } }] }
		});
		expect(res.json<any>().release.items).toEqual([]);
	});

	it('drops them from a seed', async () => {
		const res = await fx.alice.post('/seed', {
			body: { site: { seo: { schemaType: 'Hotel' }, company: { name: 'Mine' }, $managed: {} } }
		});
		expect(res.status).toBe(200);
		expect(fx.backend.store.getPublishedSiteTree('p1')).toEqual({ seo: { schemaType: 'Hotel' } });
	});
});

describe('site writes when the CMS owns the company', () => {
	beforeEach(() => {
		managed = null;
	});

	it('stores company, and still never stores $managed', async () => {
		await publishSite({ company: { name: 'Mine' }, $managed: { company: { by: 'Me' } } });
		expect((await fx.anon.get('/site')).json<Site>().contents).toEqual({
			company: { name: 'Mine' }
		});
	});
});

describe('without the company option', () => {
	it('reads and caches /site exactly as before', async () => {
		const plain = await createTestFixture();
		await plain.backend.testing.reset('p1');
		await plain.alice.post('/release/items', {
			body: { items: [{ kind: 'site', tree: { company: { name: 'Mine' } } }] }
		});
		await plain.alice.post('/release/publish');

		const res = await plain.anon.get('/site');
		expect(res.json<Site>().contents).toEqual({ company: { name: 'Mine' } });
		const version = plain.backend.store.getCmsVersion('p1');
		expect(res.headers.get('etag')).toBe(`"${version}"`);
	});
});
