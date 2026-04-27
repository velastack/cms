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
 * Resolved identity of the page-kind doc for the current request: which
 * version was loaded and whether it's the latest published or a draft. Set
 * only when the page-kind scope resolved to a doc; `null` otherwise.
 *
 * Intentionally omits `preview_key` — that's an out-of-band secret carried in
 * the URL, not in the SSR payload.
 */
export type CmsPagePointer = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
	version: number;
	status: 'draft' | 'published';
};

export type CmsPayload = {
	locale: string;
	/** Keyed by `scopeId`. */
	docs: Record<string, Record<string, unknown>>;
	/** Keyed by `scopeId`. */
	scopes: Record<string, CmsScopeEntry>;
	/** Page-scoped metadata for the current route (top-level by design — see PLAN.md). */
	metadata: Record<string, unknown>;
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
