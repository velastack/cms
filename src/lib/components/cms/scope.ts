/**
 * Scope context shared by CMS components.
 *
 * Until the Vite plugin lands, layouts and pages call `setContext(CMS_SCOPE, ...)`
 * by hand. The plugin will inject these calls automatically.
 */
import { getContext } from 'svelte';

export const CMS_SCOPE = Symbol('vela-cms:scope');

export type CmsScope = {
	scopeId: string;
	scopeKey?: string;
	kind: 'layout' | 'page';
	routeId: string;
	params?: Record<string, string>;
};

export type CmsScopeEntry = {
	scopeId: string;
	scopeKey: string;
	kind: 'layout' | 'page';
	routeId: string;
	params: Record<string, string>;
	fields: string[];
};

export type CmsPayload = {
	locale: string;
	docs: Record<string, Record<string, unknown>>;
	scopes: Record<string, CmsScopeEntry>;
};

export type CmsManifestScope = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
	fields: string[];
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
	const key = scope.scopeKey ?? scope.scopeId;
	return cms.docs[key]?.[name];
};
