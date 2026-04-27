import type { ServerLoadEvent } from '@sveltejs/kit';
import { cmsManifest } from 'virtual:vela-cms/manifest';
import type {
	CmsManifest,
	CmsPagePointer,
	CmsPayload,
	CmsScopeEntry
} from '../components/cms/scope.js';
import type { CmsAdapter, CmsScopeQuery } from './types.js';

const manifest = cmsManifest as CmsManifest;

export type LoadCmsOptions = {
	/** BCP-47 locale for the request, e.g. `'en'` or `'es-MX'`. */
	locale: string;
	/** Adapter that talks to the backing store. See {@link CmsAdapter}. */
	adapter: CmsAdapter;
};

/**
 * Result of {@link loadCms}. `cms` is the payload components consume;
 * `notFound` is `true` when the page-kind scope had owned params and the
 * adapter returned no doc for them — the caller should `error(404, …)`.
 */
export type LoadCmsResult = {
	cms: CmsPayload;
	notFound: boolean;
};

const emptyPayload = (locale: string): CmsPayload => ({
	locale,
	docs: {},
	scopes: {},
	metadata: {},
	endpoint: '/api/cms',
	page: null
});

/**
 * Resolve the CMS payload for the current SvelteKit request.
 *
 * Reads the route's scope chain from the build-time manifest, builds one
 * query per scope with its `routeId` and bound owned `params` separately,
 * asks `adapter.fetchDocs` for every scope's document, and shapes the result
 * into a {@link CmsPayload} (keyed by `scopeId`) that the runtime CMS
 * components consume via `getContext(CMS_SCOPE)` + `page.data.cms`.
 *
 * When `?preview=KEY` is present in the URL, the key is forwarded to the
 * adapter as `context.previewKey`. Adapters that support release previews
 * (e.g. `mockAdapter`) overlay any pending edits in the matching open
 * release on top of the published content for each requested scope. Without
 * a preview key, only published content is returned.
 *
 * The page-kind doc may carry a reserved `_metadata` key; it's lifted onto
 * `payload.metadata` (for `definePageMetaTags(...)`) and removed from the
 * doc map before components see it.
 *
 * Wire it into your root `+layout.server.ts`:
 *
 * ```ts
 * import { error } from '@sveltejs/kit';
 * import { loadCms, mockAdapter } from 'velacms/server';
 *
 * const adapter = mockAdapter({ layoutDocs: {}, pageDocs: {} });
 *
 * export const load = async (event) => {
 *   const { cms, notFound } = await loadCms(event, { locale: 'en', adapter });
 *   if (notFound) error(404, 'Not found');
 *   return { cms };
 * };
 * ```
 */
export const loadCms = async (
	event: ServerLoadEvent,
	options: LoadCmsOptions
): Promise<LoadCmsResult> => {
	const { locale, adapter } = options;
	const routeId = event.route.id;
	if (!routeId) return { cms: emptyPayload(locale), notFound: false };

	const route = manifest.routes[routeId];
	if (!route) return { cms: emptyPayload(locale), notFound: false };

	const params = event.params as Record<string, string>;
	const previewKey = event.url.searchParams.get('preview');

	const queries: CmsScopeQuery[] = route.scopes.map((scope) => {
		const scopeParams: Record<string, string> = {};
		for (const p of scope.ownedParams) {
			if (params[p] !== undefined) scopeParams[p] = params[p];
		}
		return {
			scopeId: scope.scopeId,
			kind: scope.kind,
			routeId: scope.routeId,
			params: scopeParams,
			fields: scope.fields,
			metadata: scope.metadata,
			locale
		};
	});

	const rawDocs = await adapter.fetchDocs(queries, { fetch: event.fetch, previewKey });

	const pageQuery = queries.find((q) => q.kind === 'page');
	let metadata: Record<string, unknown> = {};
	let pagePointer: CmsPagePointer | null = null;
	const docs: Record<string, Record<string, unknown>> = {};
	for (const [scopeId, doc] of Object.entries(rawDocs)) {
		const contents = doc.contents;
		if (pageQuery && scopeId === pageQuery.scopeId) {
			if ('_metadata' in contents) {
				const { _metadata, ...rest } = contents;
				metadata = (_metadata as Record<string, unknown>) ?? {};
				docs[scopeId] = rest;
			} else {
				docs[scopeId] = contents;
			}
		} else {
			docs[scopeId] = contents;
		}
	}

	if (pageQuery) {
		pagePointer = {
			scopeId: pageQuery.scopeId,
			routeId: pageQuery.routeId,
			params: pageQuery.params
		};
	}

	const scopes: Record<string, CmsScopeEntry> = {};
	for (const q of queries) {
		const { locale: _omit, ...entry } = q;
		scopes[q.scopeId] = entry;
	}

	const notFound =
		!!pageQuery &&
		Object.keys(pageQuery.params).length > 0 &&
		!(pageQuery.scopeId in rawDocs);

	return {
		cms: { locale, docs, scopes, metadata, endpoint: '/api/cms', page: pagePointer },
		notFound
	};
};
