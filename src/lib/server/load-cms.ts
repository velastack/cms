import { cmsManifest } from 'virtual:vela-cms/manifest';
import type {
	CmsManifest,
	CmsPayload,
	CmsScopeEntry
} from '$lib/components/cms/scope.js';

const manifest = cmsManifest as CmsManifest;

export type CmsScopeQuery = CmsScopeEntry & { locale: string };

export type FetchCmsDocs = (
	queries: CmsScopeQuery[]
) => Promise<Record<string, Record<string, unknown>>> | Record<string, Record<string, unknown>>;

export type LoadCmsForRouteOptions = {
	routeId: string | null;
	params: Record<string, string>;
	locale: string;
	fetchDocs: FetchCmsDocs;
};

const composeScopeKey = (scopeId: string, params: Record<string, string>): string => {
	const keys = Object.keys(params);
	if (keys.length === 0) return scopeId;
	const qp = keys
		.sort()
		.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
		.join('&');
	return `${scopeId}?${qp}`;
};

const emptyPayload = (locale: string): CmsPayload => ({ locale, docs: {}, scopes: {} });

/**
 * Resolve the CMS payload for a SvelteKit request: read the route's scope chain
 * from the build-time manifest, compose scope keys from each scope's owned
 * params, ask `fetchDocs` for the documents, and shape the result into the
 * `CmsPayload` runtime components consume via `getContext(CMS_SCOPE)` +
 * `page.data.cms`.
 *
 * The virtual manifest is imported from this module so callers don't have to
 * touch `virtual:vela-cms/manifest` themselves.
 */
export const loadCmsForRoute = async (
	options: LoadCmsForRouteOptions
): Promise<CmsPayload> => {
	const { routeId, params, locale, fetchDocs } = options;
	if (!routeId) return emptyPayload(locale);

	const route = manifest.routes[routeId];
	if (!route) return emptyPayload(locale);

	const queries: CmsScopeQuery[] = route.scopes.map((scope) => {
		const scopeParams: Record<string, string> = {};
		for (const p of scope.ownedParams) {
			if (params[p] !== undefined) scopeParams[p] = params[p];
		}
		const scopeKey = composeScopeKey(scope.scopeId, scopeParams);
		return {
			scopeId: scope.scopeId,
			scopeKey,
			kind: scope.kind,
			routeId: scope.routeId,
			params: scopeParams,
			fields: scope.fields,
			locale
		};
	});

	const docs = await fetchDocs(queries);

	const scopes: Record<string, CmsScopeEntry> = {};
	for (const q of queries) {
		const { locale: _omit, ...entry } = q;
		scopes[q.scopeKey] = entry;
	}

	return { locale, docs, scopes };
};
