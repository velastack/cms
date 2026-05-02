/**
 * Scope context shared by CMS components. The Vite plugin auto-injects
 * `setContext(CMS_SCOPE, …)` into every `+layout.svelte` / `+page.svelte` via
 * the `installCmsScope` helper.
 */
import { getContext } from 'svelte';

export const CMS_SCOPE = Symbol('vela-cms:scope');

export type CmsScope = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	params: Record<string, string>;
};

export type CmsScopeEntry = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	params: Record<string, string>;
	/**
	 * Lodash-style paths used by Cms* components in this scope. For pages the
	 * `metadata` branch shows up here too (e.g. `'metadata.title'`).
	 */
	fields: string[];
};

/**
 * Resolved identity of the page-kind doc for the current request. Set only
 * when a page-kind scope is present on the route; `null` otherwise.
 */
export type CmsPagePointer = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
};

/**
 * One publishable page-kind entry. Mirrored from `srv/types.ts` so client-only
 * code (`<CmsEntries>`, the merged `cms` view) can read entries without
 * importing server modules. The server type re-exports this one.
 *
 * `redirectTo` and `gone` are tombstone flags — when set, this entry is not a
 * listable page but a deletion marker. Adapters surface tombstones in
 * `fetchEntries` so prerender visits redirect URLs (and SvelteKit emits the
 * redirect file); consumer-facing payloads (`cms.entries[routeId]`) should
 * filter tombstones out before display.
 */
export type CmsEntry<Params extends Record<string, string> = Record<string, string>> = {
	params: Params;
	metadata: Record<string, unknown>;
	redirectTo?: string;
	gone?: boolean;
};

export type CmsPayload = {
	/** BCP-47 locale resolved for this request. */
	locale: string;
	/**
	 * BCP-47 supported locales from `createCms({ locales })`. First entry is
	 * the default locale used for read-time fallback when a value is missing
	 * in the requested `locale`.
	 */
	locales: string[];
	/** Keyed by `scopeId`. */
	docs: Record<string, Record<string, unknown>>;
	/** Keyed by `scopeId`. */
	scopes: Record<string, CmsScopeEntry>;
	/** Page-scoped metadata for the current route (top-level by design — see PLAN.md). */
	metadata: Record<string, unknown>;
	/** Entries for routes referenced by `<CmsEntries routeId="…">` on this route. Keyed by routeId. */
	entries: Record<string, CmsEntry[]>;
	endpoint: string;
	page: CmsPagePointer | null;
};

export type CmsManifestScope = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
	/**
	 * Lodash-style paths used by Cms* components in this scope. For pages the
	 * `metadata` branch shows up here too (e.g. `'metadata.title'`).
	 */
	fields: string[];
};

export type CmsManifestRoute = {
	scopes: CmsManifestScope[];
	/** Route ids referenced by `<CmsEntries routeId="…">` anywhere in this route's chain. */
	entriesRouteIds: string[];
};

export type CmsManifest = {
	version: 1;
	routes: Record<string, CmsManifestRoute>;
};

export const getCmsScope = (): CmsScope | undefined => getContext<CmsScope | undefined>(CMS_SCOPE);

export const getCmsValue = (
	cms: CmsPayload | undefined,
	scope: CmsScope | undefined,
	name: string
): unknown => {
	if (!cms || !scope) return undefined;
	return cms.docs[scope.scopeId]?.[name];
};

/** Find the page-scoped entry in a payload (the leaf scope), if any. */
export const getPageScope = (cms: CmsPayload | undefined): CmsScopeEntry | undefined => {
	if (!cms) return undefined;
	for (const entry of Object.values(cms.scopes)) {
		if (entry.kind === 'page') return entry;
	}
	return undefined;
};
