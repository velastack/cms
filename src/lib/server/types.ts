import type { PageDeleteOutcome } from '../core/page-entry.js';
import type { CmsEntry, CmsScopeEntry, SiteSchema } from '../components/cms/scope.ts';

export type { CmsEntry, SiteSchema };

/**
 * One scope's request, expanded from the build-time manifest with the locale
 * and any owned param values from the current SvelteKit request. Adapters
 * receive arrays of these and translate them into backend reads.
 */
export type CmsScopeQuery = CmsScopeEntry & {
	locale: string;
};

/**
 * One resolved document from an adapter. `contents` is the doc's tree —
 * lodash-style paths walk into nested branches. Page-kind docs own a
 * `metadata` branch that `loadCms` aliases as `cms.metadata`.
 */
export type CmsAdapterDoc = {
	contents: Record<string, unknown>;
};

/**
 * Tombstone for a page-kind scope: the page was deleted but the URL still
 * resolves with non-404 semantics. `kind: 'gone'` means the page is
 * deliberately permanently removed (HTTP 410); `kind: 'redirect'` means the
 * page was replaced with a permanent redirect to `to` (HTTP 308). Layout
 * scopes never resolve to a tombstone — only page-kind scopes do.
 */
export type CmsAdapterTombstone = PageDeleteOutcome;

/**
 * One resolution from an adapter for a single scope query: either the doc's
 * tree (`CmsAdapterDoc`) or a tombstone signaling the page was deleted with
 * a non-404 outcome. Discriminator: presence of `kind` on the value.
 */
export type CmsAdapterResolution = CmsAdapterDoc | CmsAdapterTombstone;

/**
 * Per-request context handed to adapter methods alongside their queries.
 * `fetch` is the SvelteKit request-scoped fetch, suitable for HTTP-backed
 * adapters that need cookie forwarding during SSR. `previewKey`, when set,
 * is the value of `?preview=…` from the request URL — adapters that support
 * release previews use it to overlay an open release's pending edits onto
 * published content. `versionKey`, when set, is the value of `?version=…` —
 * adapters resolve it to a past published release and return that release's
 * snapshot. Mutually exclusive with `previewKey`; when both are present
 * `versionKey` wins.
 *
 * `locale` is the BCP-47 string bound at `loadCms(event, { locale })` time;
 * `locales` is the full supported set from `createCms({ locales })`. The
 * first entry of `locales` is the default locale used for read-time
 * fallback. Adapters use `locale` to scope reads (`fetchEntries` doesn't
 * take queries, so it relies on this); `fetchDocs` also gets per-query
 * `locale` on each `CmsScopeQuery`.
 */
export type CmsAdapterContext = {
	fetch: typeof fetch;
	previewKey?: string | null;
	versionKey?: string | null;
	locale: string;
	locales: string[];
};

/**
 * Backend-agnostic adapter. Implementations connect Vela CMS to a backing
 * store (PocketBase, a flat-file mock, an in-memory table, …) and decide how
 * scope queries map to documents.
 *
 * `fetchDocs` is called once per request with every applicable scope. May be
 * sync or async. Page-kind docs own a `metadata` branch on their tree;
 * `loadCms` aliases it as `cms.metadata` for the request without removing it
 * from the doc — components can address `metadata.title` like any other path.
 */
export interface CmsAdapter {
	/**
	 * URL prefix the frontend uses for client-side admin-bar fetches and that
	 * gets surfaced in `CmsPayload.endpoint`. HTTP-backed adapters set this to
	 * their base URL (e.g. `https://cms.example/v1/projects/p1/cms`); adapters
	 * with no remote (`mockAdapter`) leave it unset and the loader falls back
	 * to `'/api/cms'`.
	 */
	readonly endpoint?: string;

	/**
	 * Resolve documents for every scope in `queries`. The result map is keyed
	 * by `query.scopeId`; missing entries are treated as "no document yet"
	 * and components fall back to their authored `fallback`. Adapters
	 * disambiguate page-kind documents using `routeId` + `params` from the
	 * query, never a pre-composed scope-key string. When `context.previewKey`
	 * is set, adapters that support release previews overlay the matching
	 * open release's pending field edits on top of published content before
	 * returning.
	 *
	 * Page-kind scopes may resolve to a {@link CmsAdapterTombstone} instead of
	 * a {@link CmsAdapterDoc} when the page has been deleted with a non-404
	 * outcome (gone / redirect). The resolver short-circuits the page render
	 * for tombstoned scopes; layout-kind scopes never tombstone.
	 */
	fetchDocs(
		queries: CmsScopeQuery[],
		context: CmsAdapterContext
	): Promise<Record<string, CmsAdapterResolution>> | Record<string, CmsAdapterResolution>;

	/**
	 * Enumerate the publishable entries the adapter has at a given
	 * `routeId`. Each entry carries its bound owned `params` (for SvelteKit's
	 * prerender `entries()`) plus the doc's `metadata` branch (for index pages
	 * that render a list with titles).
	 */
	fetchEntries(routeId: string, context: CmsAdapterContext): Promise<CmsEntry[]> | CmsEntry[];

	/**
	 * Resolve the project-wide site tree (branding, contact, social, …).
	 * Always one tree per project — no locale, no params. Preview-overlay
	 * support is identical to `fetchDocs`: when `context.previewKey` is set,
	 * adapters merge the open release's site item on top of the published
	 * tree. Optional — adapters that don't carry site state may omit this and
	 * the loader treats the project as having an empty site tree.
	 */
	fetchSite?(
		context: CmsAdapterContext
	): Promise<Record<string, unknown>> | Record<string, unknown>;
}
