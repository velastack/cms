/**
 * Page metadata → `svelte-meta-tags` props.
 *
 * The page scope's `metadata` branch holds what the SEO panel edits (see
 * `DEFAULT_METADATA_SCHEMA`). This maps it onto the object
 * `definePageMetaTags` / `<MetaTags>` accept, so a template's root layout is
 * one line: `deepMerge(baseMetaTags, toMetaTags(cms.metadata, { siteName }))`.
 * Share fields fall back to the search fields, and the site name — read from
 * the root layout's `branding.name` — supplies the title template and the
 * Open Graph site name.
 */
export type MetaTagsInput = Record<string, unknown>;

export type MetaTagsOptions = {
	/** The root layout's `branding.name`; drives `titleTemplate` and `openGraph.siteName`. */
	siteName?: string;
	/** Title template when `siteName` is set. `%s` is the page title. Default `'%s · <siteName>'`. */
	titleTemplate?: string;
	/** Absolute URL of the page, for `openGraph.url` when no canonical is set. */
	url?: string;
};

export type MetaTagsOutput = {
	title?: string;
	titleTemplate?: string;
	description?: string;
	canonical?: string;
	robots?: string;
	openGraph?: {
		title?: string;
		description?: string;
		url?: string;
		siteName?: string;
		images?: Array<{ url: string; alt?: string }>;
	};
	twitter?: {
		cardType?: 'summary' | 'summary_large_image';
		title?: string;
		description?: string;
		image?: string;
	};
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

const imageUrl = (v: unknown): { url: string; alt?: string } | undefined => {
	if (typeof v === 'string') return v ? { url: v } : undefined;
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		const r = v as { url?: unknown; alt?: unknown };
		if (typeof r.url === 'string' && r.url) {
			return typeof r.alt === 'string' && r.alt ? { url: r.url, alt: r.alt } : { url: r.url };
		}
	}
	return undefined;
};

export const toMetaTags = (
	metadata: MetaTagsInput,
	options: MetaTagsOptions = {}
): MetaTagsOutput => {
	const title = str(metadata.title);
	const description = str(metadata.description);
	const ogTitle = str(metadata.ogTitle) ?? title;
	const ogDescription = str(metadata.ogDescription) ?? description;
	const image = imageUrl(metadata.ogImage);
	const canonical = str(metadata.canonical);
	const card = str(metadata.twitterCard);

	const out: MetaTagsOutput = {};
	if (title) out.title = title;
	if (options.siteName) out.titleTemplate = options.titleTemplate ?? `%s · ${options.siteName}`;
	if (description) out.description = description;
	if (canonical) out.canonical = canonical;
	if (metadata.noindex === true) out.robots = 'noindex, nofollow';

	const og: NonNullable<MetaTagsOutput['openGraph']> = {};
	if (ogTitle) og.title = ogTitle;
	if (ogDescription) og.description = ogDescription;
	if (canonical ?? options.url) og.url = canonical ?? options.url;
	if (options.siteName) og.siteName = options.siteName;
	if (image) og.images = [image];
	if (Object.keys(og).length > 0) out.openGraph = og;

	const tw: NonNullable<MetaTagsOutput['twitter']> = {};
	if (card === 'summary' || card === 'summary_large_image') tw.cardType = card;
	else if (image) tw.cardType = 'summary_large_image';
	if (ogTitle) tw.title = ogTitle;
	if (ogDescription) tw.description = ogDescription;
	if (image) tw.image = image.url;
	if (Object.keys(tw).length > 0) out.twitter = tw;

	return out;
};
