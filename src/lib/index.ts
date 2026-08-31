/**
 * Public client-side API for Velastack CMS.
 *
 * Server entry points (`loadCms`, `mockAdapter`, the `CmsAdapter` interface)
 * live at `@velastack/cms/server`. The Vite plugin lives at `@velastack/cms/vite`.
 */

// Display components
export { default as CmsText } from './components/cms/cms-text.svelte';
export { default as CmsRichText } from './components/cms/cms-rich-text.svelte';
export { default as CmsMarkdown } from './components/cms/cms-markdown.svelte';
export { default as CmsImage } from './components/cms/cms-image.svelte';
export { default as CmsBoolean } from './components/cms/cms-boolean.svelte';
export { default as CmsNumber } from './components/cms/cms-number.svelte';
export type { CmsNumberProps } from './components/cms/cms-number.svelte';
export { default as CmsDateTime } from './components/cms/cms-date-time.svelte';
export type { CmsDateTimeMode, CmsDateTimeProps } from './components/cms/cms-date-time.svelte';
export { default as CmsLink } from './components/cms/cms-link.svelte';
export type { CmsLinkValue, CmsLinkRenderProps } from './components/cms/cms-link.svelte';
export { default as CmsRepeater } from './components/cms/cms-repeater.svelte';
export { default as CmsEntries } from './components/cms/cms-entries.svelte';

// Admin bar (sync wrapper; admin-bar-internal + seo-panel are async chunks)
export { default as AdminBar } from './components/admin-bar/admin-bar.svelte';

// Per-route page configuration — declare in `page.cms.ts` next to `+page.svelte`.
export { definePage } from './components/admin-bar/page-config.js';
export type {
	CmsPageConfig,
	CmsCreatablePageConfig,
	CmsStaticPageConfig,
	CmsPageField,
	CmsPageMetadataSchema,
	MetadataFieldSchema,
	MetadataPrimitive
} from './components/admin-bar/page-config.js';

// Edit-mode store
export { cmsStore } from './components/cms/cms-store.svelte.js';

// Merged CMS read view (server payload + client overlay), shaped like CmsPayload
export { cms } from './components/cms/cms-store.svelte.js';

// Scope context + helpers (used by the Vite plugin's auto-injection)
export { CMS_SCOPE, getCmsScope, getCmsValue, getPageScope } from './components/cms/scope.js';
export { installCmsScope } from './components/cms/install-scope.svelte.js';

// Types
export type {
	CmsEntry,
	CmsManifest,
	CmsManifestRoute,
	CmsManifestScope,
	CmsPayload,
	CmsScope,
	CmsScopeEntry
} from './components/cms/scope.js';
