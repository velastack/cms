import type { CmsScopeEntry } from '../components/cms/scope.ts';

/**
 * One scope's request, expanded from the build-time manifest with the locale
 * and any owned param values from the current SvelteKit request. Adapters
 * receive arrays of these and translate them into backend reads.
 */
export type CmsScopeQuery = CmsScopeEntry & {
	locale: string;
};

/**
 * One resolved document from an adapter. `contents` is the raw field map
 * (page-kind docs may include a reserved `_metadata` key that `loadCms` lifts
 * onto `cms.metadata`).
 */
export type CmsAdapterDoc = {
	contents: Record<string, unknown>;
};

/**
 * Per-request context handed to adapter methods alongside their queries.
 * `fetch` is the SvelteKit request-scoped fetch, suitable for HTTP-backed
 * adapters that need cookie forwarding during SSR. `previewKey`, when set,
 * is the value of `?preview=…` from the request URL — adapters that support
 * release previews use it to overlay an open release's pending edits onto
 * published content.
 */
export type CmsAdapterContext = {
	fetch: typeof fetch;
	previewKey?: string | null;
};

/**
 * One publishable page-kind entry, as returned by
 * {@link CmsAdapter.fetchEntries}. `params` is the bound owned-param map for
 * the route (e.g. `{ slug: 'suite-1' }`) — feed this directly to SvelteKit's
 * prerender `entries()` export. `metadata` is the entry's `_metadata` field
 * (or `{}` if the doc has none) so listing pages can render a title or
 * description per entry without a second fetch.
 *
 * Parameterized by the params shape so `generateEntries(routeId)` can return
 * route-typed params (e.g. `{ slug: string }`) instead of a generic record.
 */
export type CmsEntry<Params extends Record<string, string> = Record<string, string>> = {
	params: Params;
	metadata: Record<string, unknown>;
};

/**
 * Backend-agnostic adapter. Implementations connect Vela CMS to a backing
 * store (PocketBase, a flat-file mock, an in-memory table, …) and decide how
 * scope queries map to documents.
 *
 * `fetchDocs` is called once per request with every applicable scope. May be
 * sync or async. Page-kind docs may include a reserved `_metadata` key whose
 * value becomes `cms.metadata` for the request; `loadCms` strips it from the
 * doc before exposing the rest to components.
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
	 */
	fetchDocs(
		queries: CmsScopeQuery[],
		context: CmsAdapterContext
	): Promise<Record<string, CmsAdapterDoc>> | Record<string, CmsAdapterDoc>;

	/**
	 * Enumerate the publishable entries the adapter has at a given
	 * `routeId`. Each entry carries its bound owned `params` (for SvelteKit's
	 * prerender `entries()`) plus the doc's `_metadata` map (for index pages
	 * that render a list with titles).
	 */
	fetchEntries(routeId: string, context: CmsAdapterContext): Promise<CmsEntry[]> | CmsEntry[];
}
