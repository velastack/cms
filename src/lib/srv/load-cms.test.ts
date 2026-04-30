import { describe, expect, it } from 'vitest';
import { resolveCmsPayload } from './load-cms.ts';
import { mockAdapter } from './mock-adapter.ts';
import type { CmsManifest } from '../components/cms/scope.ts';

const fixture: CmsManifest = {
	version: 1,
	routes: {
		'/': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.copy']
				},
				{
					scopeId: 'page:/',
					kind: 'page',
					routeId: '/',
					ownedParams: [],
					fields: ['welcome.title'],
					metadata: ['title']
				}
			],
			entriesRouteIds: []
		},
		'/(marketing)/rooms/[slug]': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.copy']
				},
				{
					scopeId: 'layout:/(marketing)',
					kind: 'layout',
					routeId: '/(marketing)',
					ownedParams: [],
					fields: ['header.title']
				},
				{
					scopeId: 'page:/(marketing)/rooms/[slug]',
					kind: 'page',
					routeId: '/(marketing)/rooms/[slug]',
					ownedParams: ['slug'],
					fields: ['hero.title'],
					metadata: ['title']
				}
			],
			entriesRouteIds: []
		}
	}
};

const baseArgs = {
	manifest: fixture,
	locale: 'en',
	fetch: globalThis.fetch
};

describe('resolveCmsPayload — degenerate cases', () => {
	it('returns the empty payload when routeId is null', async () => {
		const adapter = mockAdapter({});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: null,
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.notFound).toBe(false);
		expect(result.cms.docs).toEqual({});
		expect(result.cms.scopes).toEqual({});
		expect(result.cms.page).toBeNull();
	});

	it('returns the empty payload for an unknown route', async () => {
		const adapter = mockAdapter({});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/not/in/manifest',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.docs).toEqual({});
		expect(result.notFound).toBe(false);
	});
});

describe('resolveCmsPayload — payload shape', () => {
	it('preserves scope chain order in payload.scopes (not strictly ordered, but each scope present)', async () => {
		const adapter = mockAdapter({
			layoutDocs: { '/': { 'footer.copy': 'F' }, '/(marketing)': { 'header.title': 'H' } },
			pageDocs: {
				'/(marketing)/rooms/[slug]': [
					{ params: { slug: 'a' }, published: { 'hero.title': 'Hero A' } }
				]
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(Object.keys(result.cms.scopes).sort()).toEqual([
			'layout:/',
			'layout:/(marketing)',
			'page:/(marketing)/rooms/[slug]'
		]);
		expect(result.cms.docs['layout:/']).toEqual({ 'footer.copy': 'F' });
		expect(result.cms.docs['page:/(marketing)/rooms/[slug]']).toEqual({ 'hero.title': 'Hero A' });
	});

	it('lifts a page doc _metadata field onto payload.metadata', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/': [
					{
						params: {},
						published: {
							'welcome.title': 'Hello',
							_metadata: { title: 'Home' }
						}
					}
				]
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.metadata).toEqual({ title: 'Home' });
		expect(result.cms.docs['page:/']).toEqual({ 'welcome.title': 'Hello' });
		expect(result.cms.docs['page:/']).not.toHaveProperty('_metadata');
	});

	it('emits page pointer with bound owned params only (no parent params)', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [{ params: { slug: 'a' }, published: {} }]
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a', extra: 'parent' },
			previewKey: null,
			adapter
		});
		expect(result.cms.page).toEqual({
			scopeId: 'page:/(marketing)/rooms/[slug]',
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' }
		});
	});

	it('forwards previewKey to the adapter context', async () => {
		let receivedKey: string | null | undefined = undefined;
		const adapter = {
			fetchDocs: (_q: never, c: { previewKey?: string | null }) => {
				receivedKey = c.previewKey;
				return {};
			},
			fetchEntries: () => []
		};
		await resolveCmsPayload({
			...baseArgs,
			routeId: '/',
			params: {},
			previewKey: 'abc123',
			adapter
		});
		expect(receivedKey).toBe('abc123');
	});

	it('passes only owned params per scope (parent layouts get no child params)', async () => {
		let captured: Array<{ scopeId: string; params: Record<string, string> }> = [];
		const adapter = {
			fetchDocs: (queries: { scopeId: string; params: Record<string, string> }[]) => {
				captured = queries.map((q) => ({ scopeId: q.scopeId, params: q.params }));
				return {};
			},
			fetchEntries: () => []
		};
		await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		const layoutEntry = captured.find((q) => q.scopeId === 'layout:/(marketing)');
		const pageEntry = captured.find((q) => q.scopeId === 'page:/(marketing)/rooms/[slug]');
		expect(layoutEntry?.params).toEqual({});
		expect(pageEntry?.params).toEqual({ slug: 'a' });
	});
});

describe('resolveCmsPayload — adapter endpoint', () => {
	it('falls back to /api/cms when the adapter has no endpoint set', async () => {
		const adapter = mockAdapter({});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.endpoint).toBe('/api/cms');
	});

	it('surfaces adapter.endpoint into payload.endpoint when set', async () => {
		const adapter = {
			endpoint: 'https://cms.example/v1/projects/p1/cms',
			fetchDocs: () => ({}),
			fetchEntries: () => []
		};
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.endpoint).toBe('https://cms.example/v1/projects/p1/cms');
	});

	it('surfaces adapter.endpoint on degenerate routes too', async () => {
		const adapter = {
			endpoint: 'https://cms.example/v1/projects/p1/cms',
			fetchDocs: () => ({}),
			fetchEntries: () => []
		};
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: null,
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.endpoint).toBe('https://cms.example/v1/projects/p1/cms');
	});
});

describe('resolveCmsPayload — notFound semantics', () => {
	it('flags notFound when a parameterized page has no doc for the requested params', async () => {
		const adapter = mockAdapter({
			pageDocs: { '/(marketing)/rooms/[slug]': [] }
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'missing' },
			previewKey: null,
			adapter
		});
		expect(result.notFound).toBe(true);
	});

	it('does not flag notFound when a no-param page has no doc', async () => {
		// Page-kind scope with empty params + no published doc → notFound stays
		// false (load-cms.ts:138–141: requires non-empty params).
		const adapter = mockAdapter({});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.notFound).toBe(false);
	});

	it('does not flag notFound when the parameterized page has a doc', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [{ params: { slug: 'a' }, published: { 'hero.title': 'H' } }]
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(result.notFound).toBe(false);
	});
});
