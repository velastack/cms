import type { CmsScopeEntry } from '../components/cms/scope.js';

/**
 * One scope's request, expanded from the build-time manifest with the locale
 * and any owned param values from the current SvelteKit request. Adapters
 * receive arrays of these and translate them into backend reads.
 *
 * For page-kind queries, `version` and `previewKey` carry the values of the
 * `?version` and `?preview` URL search params (when present). Adapters that
 * support versioning resolve the requested version against their store, with
 * the rule: if the requested version is the latest published, no preview key
 * is required; otherwise `previewKey` must match the stored `preview_key` for
 * that version, else the adapter omits the doc and `loadCms` 404s.
 */
export type CmsScopeQuery = CmsScopeEntry & {
	locale: string;
	version?: number | null;
	previewKey?: string | null;
};

/**
 * One resolved document from an adapter. `contents` is the raw field map
 * (page-kind docs may include a reserved `_metadata` key that `loadCms` lifts
 * onto `cms.metadata`). For page-kind scopes, adapters also return the
 * resolved `version` and `status` so `loadCms` can populate `cms.page`;
 * layout-kind scopes leave both undefined.
 */
export type CmsAdapterDoc = {
	contents: Record<string, unknown>;
	version?: number;
	status?: 'draft' | 'published';
};

/**
 * Per-request context handed to adapter methods alongside their queries.
 * `fetch` is the SvelteKit request-scoped fetch, suitable for HTTP-backed
 * adapters that need cookie forwarding during SSR.
 */
export type CmsAdapterContext = {
	fetch: typeof fetch;
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
	 * Resolve documents for every scope in `queries`. The result map is keyed
	 * by `query.scopeId`; missing entries are treated as "no document yet"
	 * and components fall back to their authored `fallback`. Adapters
	 * disambiguate page-kind documents using `routeId` + `params` from the
	 * query, never a pre-composed scope-key string.
	 */
	fetchDocs(
		queries: CmsScopeQuery[],
		context: CmsAdapterContext
	): Promise<Record<string, CmsAdapterDoc>> | Record<string, CmsAdapterDoc>;

	/**
	 * Enumerate the bound `params` maps the adapter has page docs for at a
	 * given `routeId` — used by `generateEntries` to feed SvelteKit's
	 * prerender `entries()`. Implementations should return only the
	 * combinations that are actually publishable (e.g. have a published
	 * version). Optional: adapters that don't support enumeration omit it,
	 * and `generateEntries` falls back to an empty list.
	 */
	fetchEntries?(
		routeId: string,
		context: CmsAdapterContext
	): Promise<Record<string, string>[]> | Record<string, string>[];
}
