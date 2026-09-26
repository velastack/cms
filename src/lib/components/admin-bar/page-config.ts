/**
 * Public API for declaring a route's CMS configuration in `page.cms.ts`.
 * The Vite plugin discovers these files by filename — consumers don't need
 * to import them anywhere.
 */

export type MetadataPrimitive = 'string' | 'long-string' | 'number' | 'boolean' | 'date' | 'image';

export type MetadataFieldSchema =
	| MetadataPrimitive
	| { type: MetadataPrimitive; default?: unknown }
	| { type: 'enum'; values: readonly string[]; default?: string };

export type CmsPageMetadataSchema = Record<string, MetadataFieldSchema>;

export type CmsPageField = string | { name: string; label?: string; placeholder?: string };

export type CmsCreatablePageConfig = {
	type: string;
	creatable: true;
	fields: CmsPageField[];
	transform: (data: Record<string, string>) => {
		params: Record<string, string>;
		metadata?: Record<string, unknown>;
	};
	metadata?: CmsPageMetadataSchema;
};

export type CmsStaticPageConfig = {
	creatable?: false;
	metadata?: CmsPageMetadataSchema;
};

export type CmsPageConfig = CmsCreatablePageConfig | CmsStaticPageConfig;

/** Page config with the `routeId` the plugin injected at build time. */
export type CmsPageConfigWithRouteId = CmsPageConfig & { routeId: string };

export type CmsCreatablePageConfigWithRouteId = CmsCreatablePageConfig & { routeId: string };

/**
 * Identity-typed declaration. Returns its argument; exists for type
 * inference in `page.cms.ts` files.
 */
export const definePage = <const T extends CmsPageConfig>(config: T): T => config;

export const isCreatable = (
	config: CmsPageConfigWithRouteId
): config is CmsCreatablePageConfigWithRouteId => config.creatable === true;

export type NormalizedField = { name: string; label: string; placeholder: string };

export const normalizeField = (f: CmsPageField): NormalizedField =>
	typeof f === 'string'
		? { name: f, label: f, placeholder: '' }
		: { label: f.name, placeholder: '', ...f };

/**
 * Resolve a metadata field schema's primitive type, regardless of whether
 * it was declared in shorthand string form or object form.
 */
export const fieldType = (schema: MetadataFieldSchema): MetadataPrimitive | 'enum' =>
	typeof schema === 'string' ? schema : schema.type;

/**
 * Metadata every route gets, with or without a `page.cms.ts`: the search
 * snippet, the share card, and the two indexing controls. A route's own
 * `metadata` schema is merged over this, so it only ever adds or overrides.
 * The Vite plugin's `DEFAULT_PAGE_METADATA_PATHS` mirrors these keys.
 */
export const DEFAULT_METADATA_SCHEMA: CmsPageMetadataSchema = {
	title: 'string',
	description: 'long-string',
	ogTitle: 'string',
	ogDescription: 'long-string',
	ogImage: 'image',
	twitterCard: { type: 'enum', values: ['summary', 'summary_large_image'] },
	canonical: 'string',
	noindex: 'boolean'
};

/** A route's effective metadata schema: the defaults plus its own keys. */
export const metadataSchemaFor = (own: CmsPageMetadataSchema | undefined): CmsPageMetadataSchema =>
	own ? { ...DEFAULT_METADATA_SCHEMA, ...own } : DEFAULT_METADATA_SCHEMA;
