import { describe, expect, it } from 'vitest';
import {
	findPageEntry,
	mockAdapter,
	type PageEntry,
	type ReleaseSnapshot
} from './mock-adapter.ts';
import type { CmsAdapterDoc, CmsAdapterResolution, CmsScopeQuery } from './types.ts';

const ctx = { fetch: globalThis.fetch, locale: 'en', locales: ['en'] };

const asDoc = (r: CmsAdapterResolution | undefined): CmsAdapterDoc => {
	if (!r || 'kind' in r) throw new Error(`expected doc, got ${JSON.stringify(r)}`);
	return r;
};

const layoutQuery = (routeId: string): CmsScopeQuery => ({
	scopeId: `layout:${routeId}`,
	kind: 'layout',
	routeId,
	params: {},
	fields: [],
	locale: 'en'
});

const pageQuery = (routeId: string, params: Record<string, string> = {}): CmsScopeQuery => ({
	scopeId: `page:${routeId}`,
	kind: 'page',
	routeId,
	params,
	fields: [],
	locale: 'en'
});

describe('findPageEntry', () => {
	const entries: PageEntry[] = [
		{ params: {}, published: { tag: 'root' } },
		{ params: { slug: 'a' }, published: { tag: 'a' } },
		{ params: { slug: 'b', region: 'us' }, published: { tag: 'b-us' } }
	];

	it('returns undefined for an undefined entry list', () => {
		expect(findPageEntry(undefined, { slug: 'a' })).toBeUndefined();
	});

	it('matches on an exact empty params map', () => {
		expect(findPageEntry(entries, {})?.published.tag).toBe('root');
	});

	it('matches on a single key', () => {
		expect(findPageEntry(entries, { slug: 'a' })?.published.tag).toBe('a');
	});

	it('returns undefined when key counts mismatch', () => {
		expect(findPageEntry(entries, { slug: 'b' })).toBeUndefined();
	});

	it('returns undefined when a value mismatches', () => {
		expect(findPageEntry(entries, { slug: 'b', region: 'eu' })).toBeUndefined();
	});

	it('matches when both keys and values agree', () => {
		expect(findPageEntry(entries, { slug: 'b', region: 'us' })?.published.tag).toBe('b-us');
	});
});

describe('mockAdapter.fetchDocs', () => {
	it('resolves layout documents by routeId', async () => {
		const adapter = mockAdapter({ layoutDocs: { en: { '/': { title: 'Hi' } } } });
		const out = await adapter.fetchDocs([layoutQuery('/')], ctx);
		expect(asDoc(out['layout:/']).contents).toEqual({ title: 'Hi' });
	});

	it('omits layouts that have no document', async () => {
		const adapter = mockAdapter({ layoutDocs: {} });
		const out = await adapter.fetchDocs([layoutQuery('/missing')], ctx);
		expect(out['layout:/missing']).toBeUndefined();
	});

	it('resolves page documents by routeId + exact params', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{ params: { slug: 'a' }, published: { hero: 'A' } },
						{ params: { slug: 'b' }, published: { hero: 'B' } }
					]
				}
			}
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], ctx);
		expect(asDoc(out['page:/r/[slug]']).contents).toEqual({ hero: 'A' });
	});

	it('omits page queries with no matching params', async () => {
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] } }
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'z' })], ctx);
		expect(out['page:/r/[slug]']).toBeUndefined();
	});

	it('omits docs stored in a different locale than the query', async () => {
		const adapter = mockAdapter({
			layoutDocs: { es: { '/': { title: 'Hola' } } }
		});
		const out = await adapter.fetchDocs([layoutQuery('/')], ctx);
		expect(out['layout:/']).toBeUndefined();
	});

	it('overlays release page edits onto published content', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/about',
					params: {},
					locale: 'en',
					tree: { hero: 'NEW' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/about': [{ params: {}, published: { hero: 'OLD', body: 'unchanged' } }]
				}
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/about')], {
			...ctx,
			previewKey: 'k'
		});
		expect(asDoc(out['page:/(marketing)/about']).contents).toEqual({
			hero: 'NEW',
			body: 'unchanged'
		});
	});

	it('skips release items whose locale differs from the query locale', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/about',
					params: {},
					locale: 'es',
					tree: { hero: 'NUEVO' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: { '/(marketing)/about': [{ params: {}, published: { hero: 'OLD' } }] }
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/about')], {
			...ctx,
			previewKey: 'k'
		});
		expect(asDoc(out['page:/(marketing)/about']).contents).toEqual({ hero: 'OLD' });
	});

	it('deep-merges nested branches in the release tree onto published content', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/about',
					params: {},
					locale: 'en',
					tree: { metadata: { title: 'New title' } }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/about': [
						{
							params: {},
							published: { metadata: { title: 'Old title', description: 'kept' } }
						}
					]
				}
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/about')], {
			...ctx,
			previewKey: 'k'
		});
		expect(asDoc(out['page:/(marketing)/about']).contents.metadata).toEqual({
			title: 'New title',
			description: 'kept'
		});
	});

	it('replaces arrays wholesale (no concat) when overlaying tree changes', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/rooms',
					params: {},
					locale: 'en',
					tree: { gallery: [{ caption: 'only' }] }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms': [
						{
							params: {},
							published: {
								gallery: [{ caption: 'first' }, { caption: 'second' }, { caption: 'third' }]
							}
						}
					]
				}
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/rooms')], {
			...ctx,
			previewKey: 'k'
		});
		expect(asDoc(out['page:/(marketing)/rooms']).contents.gallery).toEqual([{ caption: 'only' }]);
	});

	it('suppresses page entries marked for deletion in the release', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{ kind: 'page-delete', routeId: '/r/[slug]', params: { slug: 'a' }, locale: 'en' }
			]
		};
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] } },
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/r/[slug]']).toBeUndefined();
	});

	it('returns a redirect tombstone when the release page-delete has a redirect outcome', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page-delete',
					routeId: '/r/[slug]',
					params: { slug: 'a' },
					locale: 'en',
					outcome: { kind: 'redirect', to: '/new' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] } },
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/r/[slug]']).toEqual({ kind: 'redirect', to: '/new' });
	});

	it('returns a gone tombstone when the release page-delete has a gone outcome', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page-delete',
					routeId: '/r/[slug]',
					params: { slug: 'a' },
					locale: 'en',
					outcome: { kind: 'gone' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] } },
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/r/[slug]']).toEqual({ kind: 'gone' });
	});

	it('emits a tombstone for a published PageEntry.tombstone (no release)', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{
							params: { slug: 'old' },
							published: { hero: 'old' },
							tombstone: { kind: 'redirect', to: '/new' }
						}
					]
				}
			}
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'old' })], ctx);
		expect(out['page:/r/[slug]']).toEqual({ kind: 'redirect', to: '/new' });
	});

	it('ignores preview keys when resolvePreview is not configured', async () => {
		const adapter = mockAdapter({
			layoutDocs: { en: { '/': { x: 1 } } }
		});
		const out = await adapter.fetchDocs([layoutQuery('/')], { ...ctx, previewKey: 'whatever' });
		expect(asDoc(out['layout:/']).contents).toEqual({ x: 1 });
	});

	it('ignores preview keys when resolvePreview returns null', async () => {
		const adapter = mockAdapter({
			layoutDocs: { en: { '/': { x: 1 } } },
			resolvePreview: () => null
		});
		const out = await adapter.fetchDocs([layoutQuery('/')], { ...ctx, previewKey: 'whatever' });
		expect(asDoc(out['layout:/']).contents).toEqual({ x: 1 });
	});
});

describe('mockAdapter.fetchEntries', () => {
	it('returns [] when the route has no published entries and no release', async () => {
		const adapter = mockAdapter({});
		expect(await adapter.fetchEntries('/r/[slug]', ctx)).toEqual([]);
	});

	it('returns all published entries with metadata read from the `metadata` branch', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{
							params: { slug: 'a' },
							published: { metadata: { title: 'A' }, hero: 'a-hero' }
						},
						{
							params: { slug: 'b' },
							published: { hero: 'b-hero' }
						}
					]
				}
			}
		});
		const entries = await adapter.fetchEntries('/r/[slug]', ctx);
		expect(entries).toEqual([
			{ params: { slug: 'a' }, metadata: { title: 'A' } },
			{ params: { slug: 'b' }, metadata: {} }
		]);
	});

	it('returns [] when only a different locale has entries for this route', async () => {
		const adapter = mockAdapter({
			pageDocs: { es: { '/r/[slug]': [{ params: { slug: 'a' }, published: {} }] } }
		});
		expect(await adapter.fetchEntries('/r/[slug]', ctx)).toEqual([]);
	});

	it('drops entries marked for deletion in the release', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{ kind: 'page-delete', routeId: '/r/[slug]', params: { slug: 'a' }, locale: 'en' }
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{ params: { slug: 'a' }, published: {} },
						{ params: { slug: 'b' }, published: {} }
					]
				}
			},
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries.map((e) => e.params.slug)).toEqual(['b']);
	});

	it('keeps redirect-tombstoned entries with redirectTo flag set', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page-delete',
					routeId: '/r/[slug]',
					params: { slug: 'a' },
					locale: 'en',
					outcome: { kind: 'redirect', to: '/new' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{ params: { slug: 'a' }, published: { metadata: { title: 'A' } } }
					]
				}
			},
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries).toEqual([
			{ params: { slug: 'a' }, metadata: { title: 'A' }, redirectTo: '/new' }
		]);
	});

	it('keeps gone-tombstoned entries with gone flag set', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page-delete',
					routeId: '/r/[slug]',
					params: { slug: 'a' },
					locale: 'en',
					outcome: { kind: 'gone' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [{ params: { slug: 'a' }, published: { metadata: { title: 'A' } } }]
				}
			},
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries).toEqual([
			{ params: { slug: 'a' }, metadata: { title: 'A' }, gone: true }
		]);
	});

	it('returns published-state tombstones with appropriate flags (no release)', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/r/[slug]': [
						{ params: { slug: 'live' }, published: {} },
						{
							params: { slug: 'old' },
							published: {},
							tombstone: { kind: 'redirect', to: '/new' }
						},
						{
							params: { slug: 'dead' },
							published: {},
							tombstone: { kind: 'gone' }
						}
					]
				}
			}
		});
		const entries = await adapter.fetchEntries('/r/[slug]', ctx);
		expect(entries).toEqual([
			{ params: { slug: 'live' }, metadata: {} },
			{ params: { slug: 'old' }, metadata: {}, redirectTo: '/new' },
			{ params: { slug: 'dead' }, metadata: {}, gone: true }
		]);
	});

	it('appends release-only draft entries that have no matching published entry', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/r/[slug]',
					params: { slug: 'new' },
					locale: 'en',
					tree: { metadata: { title: 'New' } }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: {} }] } },
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries.map((e) => e.params.slug).sort()).toEqual(['a', 'new']);
		const newEntry = entries.find((e) => e.params.slug === 'new')!;
		expect(newEntry.metadata).toEqual({ title: 'New' });
	});

	it('does not double-list entries when a release re-edits an existing one', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/r/[slug]',
					params: { slug: 'a' },
					locale: 'en',
					tree: { hero: 'edited' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { en: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'orig' } }] } },
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries).toHaveLength(1);
	});
});
