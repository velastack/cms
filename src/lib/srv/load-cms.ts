import type { ServerLoadEvent } from '@sveltejs/kit';
import { cmsManifest } from 'virtual:vela-cms/manifest';
import type {
	CmsEntry,
	CmsManifest,
	CmsPagePointer,
	CmsPayload,
	CmsScopeEntry
} from '../components/cms/scope.ts';
import type { CmsAdapter, CmsScopeQuery } from './types.ts';
import { building } from '$app/environment';

const builtManifest = cmsManifest as CmsManifest;

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

/**
 * Pure inputs to {@link resolveCmsPayload}: everything {@link loadCms} reads
 * from the SvelteKit `event` plus the build-time manifest, separated so tests
 * can drive the resolver with a hand-built manifest and synthetic params.
 */
export type ResolveCmsPayloadArgs = {
	manifest: CmsManifest;
	routeId: string | null;
	params: Record<string, string>;
	previewKey: string | null;
	locale: string;
	adapter: CmsAdapter;
	fetch: typeof fetch;
};

const DEFAULT_ENDPOINT = '/api/cms';

const emptyPayload = (locale: string, endpoint: string): CmsPayload => ({
	locale,
	docs: {},
	scopes: {},
	metadata: {},
	entries: {},
	endpoint,
	page: null
});

/**
 * Pure resolver: build per-scope queries from the manifest, ask the adapter
 * for documents, and shape a {@link CmsPayload}. The page-kind doc owns a
 * `metadata` branch on its tree; `payload.metadata` aliases that branch for
 * `definePageMetaTags(...)`. No SvelteKit dependency — used directly by tests.
 */
export const resolveCmsPayload = async (args: ResolveCmsPayloadArgs): Promise<LoadCmsResult> => {
	const { manifest, routeId, params, previewKey, locale, adapter, fetch } = args;
	const endpoint = adapter.endpoint ?? DEFAULT_ENDPOINT;

	if (!routeId) return { cms: emptyPayload(locale, endpoint), notFound: false };

	const route = manifest.routes[routeId];
	if (!route) return { cms: emptyPayload(locale, endpoint), notFound: false };

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
			locale
		};
	});

	const entriesRouteIds = route.entriesRouteIds ?? [];
	const [rawDocs, entriesPairs] = await Promise.all([
		adapter.fetchDocs(queries, { fetch, previewKey }),
		Promise.all(
			entriesRouteIds.map(async (rid): Promise<[string, CmsEntry[]]> => [
				rid,
				await adapter.fetchEntries(rid, { fetch, previewKey })
			])
		)
	]);
	const entries: Record<string, CmsEntry[]> = Object.fromEntries(entriesPairs);

	const pageQuery = queries.find((q) => q.kind === 'page');
	let pagePointer: CmsPagePointer | null = null;
	const docs: Record<string, Record<string, unknown>> = {};
	for (const [scopeId, doc] of Object.entries(rawDocs)) {
		docs[scopeId] = doc.contents;
	}

	let metadata: Record<string, unknown> = {};
	if (pageQuery) {
		pagePointer = {
			scopeId: pageQuery.scopeId,
			routeId: pageQuery.routeId,
			params: pageQuery.params
		};
		const pageDoc = docs[pageQuery.scopeId];
		const meta = pageDoc?.metadata;
		if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
			metadata = meta as Record<string, unknown>;
		}
	}

	const scopes: Record<string, CmsScopeEntry> = {};
	for (const q of queries) {
		const { locale: _omit, ...entry } = q;
		scopes[q.scopeId] = entry;
	}

	const notFound =
		!!pageQuery && Object.keys(pageQuery.params).length > 0 && !(pageQuery.scopeId in rawDocs);

	return {
		cms: { locale, docs, scopes, metadata, entries, endpoint, page: pagePointer },
		notFound
	};
};

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
 * The page-kind doc owns a `metadata` branch on its tree; `payload.metadata`
 * aliases it for `definePageMetaTags(...)`. The doc itself is unchanged —
 * components addressing `metadata.title` etc. read straight through.
 *
 * Wire it into your root `+layout.server.ts`:
 *
 * ```ts
 * import { error } from '@sveltejs/kit';
 * import { loadCms, mockAdapter } from '@velastack/cms/server';
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
export const loadCms = (event: ServerLoadEvent, options: LoadCmsOptions): Promise<LoadCmsResult> =>
	resolveCmsPayload({
		manifest: builtManifest,
		routeId: event.route.id,
		params: event.params as Record<string, string>,
		previewKey: building ? null : event.url.searchParams.get('preview'),
		locale: options.locale,
		adapter: options.adapter,
		fetch: event.fetch
	});
