declare module 'virtual:vela-cms/manifest' {
	import type { CmsManifest } from '$lib/components/cms/scope.js';
	export const cmsManifest: CmsManifest;
}

declare module 'virtual:vela-cms/pages' {
	import type { CmsPageConfigWithRouteId } from '$lib/components/admin-bar/page-config.js';
	export const pages: Record<string, CmsPageConfigWithRouteId>;
}
