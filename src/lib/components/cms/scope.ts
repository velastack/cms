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
	fields: string[];
	/** Editable metadata field names. Present only for `kind === 'page'`. */
	metadata?: string[];
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
 */
export type CmsEntry<Params extends Record<string, string> = Record<string, string>> = {
	params: Params;
	metadata: Record<string, unknown>;
};

export type CmsPayload = {
	locale: string;
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
	fields: string[];
	/** Editable metadata field names. Present only for `kind === 'page'`. */
	metadata?: string[];
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
