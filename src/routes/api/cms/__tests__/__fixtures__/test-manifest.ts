import type { CmsManifest } from '$lib/components/cms/scope.js';

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
