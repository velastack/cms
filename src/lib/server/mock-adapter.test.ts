import { describe, expect, it } from 'vitest';
import {
	findPageEntry,
	mockAdapter,
	type PageEntry,
	type ReleaseSnapshot
} from './mock-adapter.js';
import type { CmsScopeQuery } from './types.js';

const ctx = { fetch: globalThis.fetch };

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
		const adapter = mockAdapter({ layoutDocs: { '/': { title: 'Hi' } } });
		const out = await adapter.fetchDocs([layoutQuery('/')], ctx);
		expect(out['layout:/'].contents).toEqual({ title: 'Hi' });
	});

	it('omits layouts that have no document', async () => {
		const adapter = mockAdapter({ layoutDocs: {} });
		const out = await adapter.fetchDocs([layoutQuery('/missing')], ctx);
		expect(out['layout:/missing']).toBeUndefined();
	});

	it('resolves page documents by routeId + exact params', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/r/[slug]': [
					{ params: { slug: 'a' }, published: { hero: 'A' } },
					{ params: { slug: 'b' }, published: { hero: 'B' } }
				]
			}
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], ctx);
		expect(out['page:/r/[slug]'].contents).toEqual({ hero: 'A' });
	});

	it('omits page queries with no matching params', async () => {
		const adapter = mockAdapter({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] }
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'z' })], ctx);
		expect(out['page:/r/[slug]']).toBeUndefined();
	});

	it('overlays release page edits onto published content', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/about',
					params: {},
					fields: { hero: 'NEW' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				'/(marketing)/about': [
					{ params: {}, published: { hero: 'OLD', body: 'unchanged' } }
				]
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/about')], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/(marketing)/about'].contents).toEqual({
			hero: 'NEW',
			body: 'unchanged'
		});
	});

	it('shallow-merges _metadata in release overlay rather than replacing it', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/(marketing)/about',
					params: {},
					fields: { _metadata: { title: 'New title' } }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: {
				'/(marketing)/about': [
					{
						params: {},
						published: { _metadata: { title: 'Old title', description: 'kept' } }
					}
				]
			},
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/(marketing)/about')], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/(marketing)/about'].contents._metadata).toEqual({
			title: 'New title',
			description: 'kept'
		});
	});

	it('suppresses page entries marked for deletion in the release', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [{ kind: 'page-delete', routeId: '/r/[slug]', params: { slug: 'a' } }]
		};
		const adapter = mockAdapter({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'A' } }] },
			resolvePreview: () => release
		});
		const out = await adapter.fetchDocs([pageQuery('/r/[slug]', { slug: 'a' })], {
			...ctx,
			previewKey: 'k'
		});
		expect(out['page:/r/[slug]']).toBeUndefined();
	});

	it('ignores preview keys when resolvePreview is not configured', async () => {
		const adapter = mockAdapter({
			layoutDocs: { '/': { x: 1 } }
		});
		const out = await adapter.fetchDocs([layoutQuery('/')], { ...ctx, previewKey: 'whatever' });
		expect(out['layout:/'].contents).toEqual({ x: 1 });
	});

	it('ignores preview keys when resolvePreview returns null', async () => {
		const adapter = mockAdapter({
			layoutDocs: { '/': { x: 1 } },
			resolvePreview: () => null
		});
		const out = await adapter.fetchDocs([layoutQuery('/')], { ...ctx, previewKey: 'whatever' });
		expect(out['layout:/'].contents).toEqual({ x: 1 });
	});
});

describe('mockAdapter.fetchEntries', () => {
	it('returns [] when the route has no published entries and no release', async () => {
		const adapter = mockAdapter({});
		expect(await adapter.fetchEntries('/r/[slug]', ctx)).toEqual([]);
	});

	it('returns all published entries with metadata lifted from _metadata', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/r/[slug]': [
					{
						params: { slug: 'a' },
						published: { _metadata: { title: 'A' }, hero: 'a-hero' }
					},
					{
						params: { slug: 'b' },
						published: { hero: 'b-hero' }
					}
				]
			}
		});
		const entries = await adapter.fetchEntries('/r/[slug]', ctx);
		expect(entries).toEqual([
			{ params: { slug: 'a' }, metadata: { title: 'A' } },
			{ params: { slug: 'b' }, metadata: {} }
		]);
	});

	it('drops entries marked for deletion in the release', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [{ kind: 'page-delete', routeId: '/r/[slug]', params: { slug: 'a' } }]
		};
		const adapter = mockAdapter({
			pageDocs: {
				'/r/[slug]': [
					{ params: { slug: 'a' }, published: {} },
					{ params: { slug: 'b' }, published: {} }
				]
			},
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries.map((e) => e.params.slug)).toEqual(['b']);
	});

	it('appends release-only draft entries that have no matching published entry', async () => {
		const release: ReleaseSnapshot = {
			id: 'u1',
			items: [
				{
					kind: 'page',
					routeId: '/r/[slug]',
					params: { slug: 'new' },
					fields: { _metadata: { title: 'New' } }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: {} }] },
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
					fields: { hero: 'edited' }
				}
			]
		};
		const adapter = mockAdapter({
			pageDocs: { '/r/[slug]': [{ params: { slug: 'a' }, published: { hero: 'orig' } }] },
			resolvePreview: () => release
		});
		const entries = await adapter.fetchEntries('/r/[slug]', { ...ctx, previewKey: 'k' });
		expect(entries).toHaveLength(1);
	});
});
