import type { CmsManifest } from '$lib/components/cms/scope.js';

/**
 * Stable {@link CmsManifest} fixture used by API + server tests. The vitest
 * `server` project aliases `virtual:vela-cms/manifest` to this file so
 * handlers see a deterministic route shape regardless of what's currently
 * in `src/routes`.
 *
 * Routes mirror the demo's high-level shape: a root with a page, a marketing
 * layout chain (about + parameterized rooms), and an app layout chain
 * (dashboard).
 */
export const cmsManifest: CmsManifest = {
	version: 1,
	routes: {
		'/': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'page:/',
					kind: 'page',
					routeId: '/',
					ownedParams: [],
					fields: ['welcome.title', 'welcome.body'],
					metadata: ['title', 'description', 'canonical', 'robots']
				}
			]
		},
		'/(marketing)/about': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'layout:/(marketing)',
					kind: 'layout',
					routeId: '/(marketing)',
					ownedParams: [],
					fields: ['header.title', 'announcement.text']
				},
				{
					scopeId: 'page:/(marketing)/about',
					kind: 'page',
					routeId: '/(marketing)/about',
					ownedParams: [],
					fields: ['hero.title', 'body'],
					metadata: ['title', 'description', 'canonical', 'robots']
				}
			]
		},
		'/(marketing)/rooms/[slug]': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'layout:/(marketing)',
					kind: 'layout',
					routeId: '/(marketing)',
					ownedParams: [],
					fields: ['header.title', 'announcement.text']
				},
				{
					scopeId: 'page:/(marketing)/rooms/[slug]',
					kind: 'page',
					routeId: '/(marketing)/rooms/[slug]',
					ownedParams: ['slug'],
					fields: ['hero.title', 'hero.image', 'gallery.items'],
					metadata: ['title', 'description', 'canonical', 'robots']
				}
			]
		},
		'/(app)/dashboard': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'layout:/(app)',
					kind: 'layout',
					routeId: '/(app)',
					ownedParams: [],
					fields: ['header.title']
				},
				{
					scopeId: 'page:/(app)/dashboard',
					kind: 'page',
					routeId: '/(app)/dashboard',
					ownedParams: [],
					fields: ['welcome.title', 'body'],
					metadata: ['title', 'description', 'canonical', 'robots']
				}
			]
		}
	}
};
