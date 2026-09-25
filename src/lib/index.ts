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
export type { CmsLinkRenderProps } from './components/cms/cms-link.svelte';
export { default as CmsEntries } from './components/cms/cms-entries.svelte';

// Structured editor components. Each reads one versioned value, opens a
// popover editor in edit mode and hands the typed view to `children`.
// Their value types, normalizers and JSON-LD helpers come from the shapes.
export { default as CmsNav } from './components/cms/cms-nav.svelte';
export { default as CmsHours } from './components/cms/cms-hours.svelte';
export { default as CmsContact } from './components/cms/cms-contact.svelte';
export { default as CmsSocialLinks } from './components/cms/cms-social-links.svelte';
export { default as CmsCollection } from './components/cms/cms-collection.svelte';
export { default as CmsTeam } from './components/cms/cms-team.svelte';
export { default as CmsTestimonials } from './components/cms/cms-testimonials.svelte';
export { default as CmsPricing } from './components/cms/cms-pricing.svelte';
export { default as CmsFaq } from './components/cms/cms-faq.svelte';
// List presets: fixed item shapes; a new shape is a new preset here.
export { default as CmsStats } from './components/cms/cms-stats.svelte';
export { default as CmsSteps } from './components/cms/cms-steps.svelte';
export { default as CmsTimeline } from './components/cms/cms-timeline.svelte';
export { default as CmsGallery } from './components/cms/cms-gallery.svelte';
export { default as CmsLogos } from './components/cms/cms-logos.svelte';
export { default as CmsSchedule } from './components/cms/cms-schedule.svelte';
export * from './core/shapes/index.js';

// Admin bar (sync wrapper; admin-bar-internal + seo-panel are async chunks)
export { default as AdminBar } from './components/admin-bar/admin-bar.svelte';

// Building blocks for structured components: the field hook, the value
// rules (versioned shapes, `$t` overlay) and the registry the Locales panel
// reads. The editor popover and field inputs are admin-bar chunks, imported
// lazily by editable siblings:
//   `import('@velastack/cms/editor')`
export {
	useCmsField,
	resolveScopeRef,
	ROOT_SCOPE_ID
} from './components/cms/use-cms-field.svelte.js';
export type { CmsField, CmsFieldInput } from './components/cms/use-cms-field.svelte.js';
export {
	defineStructured,
	applyTranslations,
	countTranslations,
	extractTranslations,
	stripTranslations,
	translatableFields,
	translationPath,
	asBoolean,
	asEnum,
	asItems,
	asNumber,
	asOptionalString,
	asString,
	asStrings,
	moveItem,
	newItemId,
	setIn,
	ROOT_ID,
	TRANSLATIONS_KEY
} from './core/structured.js';
export type {
	ItemsSpec,
	Structured,
	StructuredItem,
	StructuredSchema,
	TranslatableField,
	TranslationOverlay
} from './core/structured.js';
export { registerStructured, getStructured } from './core/structured-registry.js';

// Page metadata → svelte-meta-tags props.
export { toMetaTags } from './core/metadata.js';
export type { MetaTagsOptions, MetaTagsOutput } from './core/metadata.js';

// Per-route page configuration — declare in `page.cms.ts` next to `+page.svelte`.
export {
	definePage,
	DEFAULT_METADATA_SCHEMA,
	metadataSchemaFor
} from './components/admin-bar/page-config.js';
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
	CmsManifestUsage,
	CmsPayload,
	CmsScope,
	CmsScopeEntry,
	SiteFieldSchema,
	SiteFieldType,
	SiteSchema
} from './components/cms/scope.js';
