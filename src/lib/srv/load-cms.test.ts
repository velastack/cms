import { describe, expect, it, vi } from 'vitest';
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
					fields: ['welcome.title', 'metadata.title']
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
					fields: ['hero.title', 'metadata.title']
				}
			],
			entriesRouteIds: []
		}
	}
};

const baseArgs = {
	manifest: fixture,
	locale: 'en',
	locales: ['en'],
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
			layoutDocs: {
				en: { '/': { footer: { copy: 'F' } }, '/(marketing)': { header: { title: 'H' } } }
			},
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'a' }, published: { hero: { title: 'Hero A' } } }
					]
				}
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
		expect(result.cms.docs['layout:/']).toEqual({ footer: { copy: 'F' } });
		expect(result.cms.docs['page:/(marketing)/rooms/[slug]']).toEqual({ hero: { title: 'Hero A' } });
	});

	it('aliases the page doc `metadata` branch onto payload.metadata', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/': [
						{
							params: {},
							published: {
								welcome: { title: 'Hello' },
								metadata: { title: 'Home' }
							}
						}
					]
				}
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
		// `metadata` stays on the doc — `cms.metadata` is an alias, not a lift.
		expect(result.cms.docs['page:/']).toEqual({
			welcome: { title: 'Hello' },
			metadata: { title: 'Home' }
		});
	});

	it('emits page pointer with bound owned params only (no parent params)', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [{ params: { slug: 'a' }, published: {} }]
				}
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

describe('resolveCmsPayload — locale fallback', () => {
	it('exposes the supported locales on the payload', async () => {
		const adapter = mockAdapter({});
		const result = await resolveCmsPayload({
			...baseArgs,
			locales: ['en', 'es', 'fr'],
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.locales).toEqual(['en', 'es', 'fr']);
	});

	it('falls back to the default-locale doc for keys missing in the requested locale', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/': [
						{
							params: {},
							published: { welcome: { title: 'Hello' }, metadata: { title: 'Home' } }
						}
					]
				},
				es: {
					'/': [
						{
							params: {},
							published: { welcome: { title: 'Hola' } }
							// No metadata in es — should fall back to en's metadata
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.docs['page:/']).toEqual({
			welcome: { title: 'Hola' },
			metadata: { title: 'Home' }
		});
		expect(result.cms.metadata).toEqual({ title: 'Home' });
	});

	it('uses the default-locale doc entirely when the requested locale has no doc', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/': [
						{ params: {}, published: { welcome: { title: 'Hello' } } }
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/',
			params: {},
			previewKey: null,
			adapter
		});
		expect(result.cms.docs['page:/']).toEqual({ welcome: { title: 'Hello' } });
	});

	it('does not flag notFound when only the default-locale doc exists for a parameterized page', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'a' }, published: { hero: { title: 'H' } } }
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(result.notFound).toBe(false);
	});
});

describe('resolveCmsPayload — tombstones', () => {
	it('returns redirectTo when the page-kind scope resolves to a redirect tombstone', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{
							params: { slug: 'old' },
							published: { hero: { title: 'old' } },
							tombstone: { kind: 'redirect', to: '/rooms/new' }
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'old' },
			previewKey: null,
			adapter
		});
		expect(result.redirectTo).toBe('/rooms/new');
		expect(result.gone).toBe(false);
		expect(result.notFound).toBe(false);
		// Payload is the empty shape — redirect short-circuits before doc shaping.
		expect(result.cms.docs).toEqual({});
	});

	it('returns gone=true when the page-kind scope resolves to a gone tombstone', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{
							params: { slug: 'old' },
							published: {},
							tombstone: { kind: 'gone' }
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'old' },
			previewKey: null,
			adapter
		});
		expect(result.gone).toBe(true);
		expect(result.redirectTo).toBeNull();
		expect(result.notFound).toBe(false);
	});

	it('requested-locale doc beats default-locale tombstone', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{
							params: { slug: 'a' },
							published: {},
							tombstone: { kind: 'redirect', to: '/rooms/new' }
						}
					]
				},
				es: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'a' }, published: { hero: { title: 'Hola' } } }
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(result.redirectTo).toBeNull();
		expect(result.cms.docs['page:/(marketing)/rooms/[slug]']).toEqual({
			hero: { title: 'Hola' }
		});
	});

	it('requested-locale tombstone wins over default-locale doc', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'a' }, published: { hero: { title: 'Hi' } } }
					]
				},
				es: {
					'/(marketing)/rooms/[slug]': [
						{
							params: { slug: 'a' },
							published: {},
							tombstone: { kind: 'redirect', to: '/es/rooms/nuevo' }
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(result.redirectTo).toBe('/es/rooms/nuevo');
	});

	it('default-locale tombstone applies when requested-locale has nothing', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{
							params: { slug: 'a' },
							published: {},
							tombstone: { kind: 'redirect', to: '/rooms/new' }
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			locale: 'es',
			locales: ['en', 'es'],
			routeId: '/(marketing)/rooms/[slug]',
			params: { slug: 'a' },
			previewKey: null,
			adapter
		});
		expect(result.redirectTo).toBe('/rooms/new');
	});

	it('drops listed entries that are tombstones from cms.entries (consumer-facing)', async () => {
		// Add a manifest variant exposing entries on a parent route.
		const manifest: CmsManifest = {
			version: 1,
			routes: {
				'/index': {
					scopes: [],
					entriesRouteIds: ['/(marketing)/rooms/[slug]']
				},
				'/(marketing)/rooms/[slug]': {
					scopes: [
						{
							scopeId: 'page:/(marketing)/rooms/[slug]',
							kind: 'page',
							routeId: '/(marketing)/rooms/[slug]',
							ownedParams: ['slug'],
							fields: []
						}
					],
					entriesRouteIds: []
				}
			}
		};
		const adapter = mockAdapter({
			pageDocs: {
				en: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'live' }, published: {} },
						{
							params: { slug: 'redirected' },
							published: {},
							tombstone: { kind: 'redirect', to: '/rooms/live' }
						},
						{
							params: { slug: 'gone' },
							published: {},
							tombstone: { kind: 'gone' }
						}
					]
				}
			}
		});
		const result = await resolveCmsPayload({
			...baseArgs,
			manifest,
			routeId: '/index',
			params: {},
			previewKey: null,
			adapter
		});
		const slugs =
			result.cms.entries['/(marketing)/rooms/[slug]']?.map((e) => e.params.slug) ?? [];
		expect(slugs).toEqual(['live']);
	});
});

describe('loadCms — server-only guard', () => {
	it('throws when called from the browser', async () => {
		vi.resetModules();
		vi.doMock('$app/environment', () => ({ browser: true, building: false }));
		const { loadCms } = await import('./load-cms.ts');
		const adapter = mockAdapter({});
		const event = {
			route: { id: '/' },
			params: {},
			url: new URL('http://example/'),
			fetch: globalThis.fetch
		} as unknown as Parameters<typeof loadCms>[0];
		expect(() => loadCms(event, { locale: 'en', locales: ['en'], adapter })).toThrow(
			/server-only/
		);
		vi.doUnmock('$app/environment');
		vi.resetModules();
	});
});

describe('resolveCmsPayload — notFound semantics', () => {
	it('flags notFound when a parameterized page has no doc for the requested params', async () => {
		const adapter = mockAdapter({
			pageDocs: { en: { '/(marketing)/rooms/[slug]': [] } }
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
				en: {
					'/(marketing)/rooms/[slug]': [
						{ params: { slug: 'a' }, published: { hero: { title: 'H' } } }
					]
				}
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
