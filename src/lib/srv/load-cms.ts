import type { ServerLoadEvent } from '@sveltejs/kit';
import { cmsManifest } from 'virtual:vela-cms/manifest';
import type {
	CmsEntry,
	CmsManifest,
	CmsPagePointer,
	CmsPayload,
	CmsScopeEntry
} from '../components/cms/scope.ts';
import { mergeTree } from '../components/cms/path.ts';
import type {
	CmsAdapter,
	CmsAdapterResolution,
	CmsAdapterTombstone,
	CmsScopeQuery
} from './types.ts';
import { browser, building } from '$app/environment';

const builtManifest = cmsManifest as CmsManifest;

export type LoadCmsOptions = {
	/** BCP-47 locale for the request, e.g. `'en'` or `'es-MX'`. */
	locale: string;
	/**
	 * BCP-47 supported locales. First entry is the default locale used for
	 * read-time fallback when a value is missing in the requested `locale`.
	 */
	locales: string[];
	/** Adapter that talks to the backing store. See {@link CmsAdapter}. */
	adapter: CmsAdapter;
};

/**
 * Result of {@link loadCms}. `cms` is the payload components consume;
 * the three flags are mutually exclusive resolutions for the page-kind scope:
 *
 *  - `redirectTo` — set to a target URL when the page was replaced with a
 *    permanent redirect; the caller should `redirect(308, redirectTo)`.
 *  - `gone` — `true` when the page was deliberately permanently removed; the
 *    caller should `error(410, …)`.
 *  - `notFound` — `true` when the page-kind scope had owned params and the
 *    adapter returned no doc and no tombstone; the caller should
 *    `error(404, …)`.
 *
 * Resolution priority (handled in `resolveCmsPayload`): `redirectTo` →
 * `gone` → `notFound` → render. Consumers should branch in that order.
 */
export type LoadCmsResult = {
	cms: CmsPayload;
	notFound: boolean;
	gone: boolean;
	redirectTo: string | null;
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
	versionKey?: string | null;
	locale: string;
	locales: string[];
	adapter: CmsAdapter;
	fetch: typeof fetch;
};

const DEFAULT_ENDPOINT = '/api/cms';

const emptyPayload = (locale: string, locales: string[], endpoint: string): CmsPayload => ({
	locale,
	locales,
	docs: {},
	scopes: {},
	metadata: {},
	entries: {},
	endpoint,
	page: null
});

const isTombstone = (r: CmsAdapterResolution | undefined): r is CmsAdapterTombstone =>
	!!r && 'kind' in r;

/**
 * Pure resolver: build per-scope queries from the manifest, ask the adapter
 * for documents, and shape a {@link CmsPayload}. The page-kind doc owns a
 * `metadata` branch on its tree; `payload.metadata` aliases that branch for
 * `definePageMetaTags(...)`. No SvelteKit dependency — used directly by tests.
 */
export const resolveCmsPayload = async (args: ResolveCmsPayloadArgs): Promise<LoadCmsResult> => {
	const { manifest, routeId, params, previewKey, locale, locales, adapter, fetch } = args;
	const versionKey = args.versionKey ?? null;
	const endpoint = adapter.endpoint ?? DEFAULT_ENDPOINT;
	const defaultLocale = locales[0] ?? locale;
	const needsFallback = locale !== defaultLocale;

	if (!routeId)
		return {
			cms: emptyPayload(locale, locales, endpoint),
			notFound: false,
			gone: false,
			redirectTo: null
		};

	const route = manifest.routes[routeId];
	if (!route)
		return {
			cms: emptyPayload(locale, locales, endpoint),
			notFound: false,
			gone: false,
			redirectTo: null
		};

	const buildQueries = (forLocale: string): CmsScopeQuery[] =>
		route.scopes.map((scope) => {
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
				locale: forLocale
			};
		});

	const queries = buildQueries(locale);
	const fallbackQueries = needsFallback ? buildQueries(defaultLocale) : null;

	const ctx = (forLocale: string) => ({
		fetch,
		previewKey,
		versionKey,
		locale: forLocale,
		locales
	});

	const entriesRouteIds = route.entriesRouteIds ?? [];
	const noDocs: Record<string, CmsAdapterResolution> = {};
	const [rawDocs, fallbackDocs, entriesPairs, fallbackEntriesPairs] = await Promise.all([
		Promise.resolve(adapter.fetchDocs(queries, ctx(locale))),
		fallbackQueries
			? Promise.resolve(adapter.fetchDocs(fallbackQueries, ctx(defaultLocale)))
			: Promise.resolve(noDocs),
		Promise.all(
			entriesRouteIds.map(async (rid): Promise<[string, CmsEntry[]]> => [
				rid,
				await adapter.fetchEntries(rid, ctx(locale))
			])
		),
		needsFallback
			? Promise.all(
					entriesRouteIds.map(async (rid): Promise<[string, CmsEntry[]]> => [
						rid,
						await adapter.fetchEntries(rid, ctx(defaultLocale))
					])
				)
			: Promise.resolve([] as Array<[string, CmsEntry[]]>)
	]);

	// Adapter `fetchEntries` returns tombstones (redirect / gone) so the
	// prerender path can visit redirected URLs. The consumer-facing payload
	// drops them — `<CmsEntries>` lists shouldn't display deleted pages.
	const isListable = (e: CmsEntry): boolean => !e.redirectTo && !e.gone;
	const entries: Record<string, CmsEntry[]> = {};
	const fallbackEntries: Record<string, CmsEntry[]> = Object.fromEntries(fallbackEntriesPairs);
	for (const [rid, list] of entriesPairs) {
		if (!needsFallback) {
			entries[rid] = list.filter(isListable);
			continue;
		}
		// Union by stringified params; requested-locale entries win on metadata.
		const merged = new Map<string, CmsEntry>();
		for (const e of fallbackEntries[rid] ?? []) merged.set(JSON.stringify(e.params), e);
		for (const e of list) merged.set(JSON.stringify(e.params), e);
		entries[rid] = [...merged.values()].filter(isListable);
	}

	const pageQuery = queries.find((q) => q.kind === 'page');

	// Page-kind scope can resolve to a tombstone (gone / redirect). Priority:
	// requested-locale tombstone wins outright; otherwise requested-locale doc
	// uses normal merge; otherwise default-locale tombstone applies; otherwise
	// default-locale doc; otherwise notFound (when params are owned).
	if (pageQuery) {
		const requested = rawDocs[pageQuery.scopeId];
		const fallback = fallbackDocs[pageQuery.scopeId];
		let tombstone: CmsAdapterTombstone | null = null;
		if (isTombstone(requested)) tombstone = requested;
		else if (!requested && isTombstone(fallback)) tombstone = fallback;
		if (tombstone) {
			return {
				cms: emptyPayload(locale, locales, endpoint),
				notFound: false,
				gone: tombstone.kind === 'gone',
				redirectTo: tombstone.kind === 'redirect' ? tombstone.to : null
			};
		}
	}

	let pagePointer: CmsPagePointer | null = null;
	const docs: Record<string, Record<string, unknown>> = {};
	const allScopeIds = new Set<string>([...Object.keys(rawDocs), ...Object.keys(fallbackDocs)]);
	for (const scopeId of allScopeIds) {
		const r = rawDocs[scopeId];
		const f = fallbackDocs[scopeId];
		const requested = isTombstone(r) ? undefined : r?.contents;
		const fallback = isTombstone(f) ? undefined : f?.contents;
		if (needsFallback && fallback && requested) {
			docs[scopeId] = mergeTree(fallback, requested);
		} else if (needsFallback && fallback) {
			docs[scopeId] = fallback;
		} else if (requested) {
			docs[scopeId] = requested;
		}
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

	const pageScopeMissing =
		!!pageQuery &&
		Object.keys(pageQuery.params).length > 0 &&
		!(pageQuery.scopeId in rawDocs) &&
		!(pageQuery.scopeId in fallbackDocs);

	return {
		cms: { locale, locales, docs, scopes, metadata, entries, endpoint, page: pagePointer },
		notFound: pageScopeMissing,
		gone: false,
		redirectTo: null
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
 * import { error, redirect } from '@sveltejs/kit';
 * import { loadCms, mockAdapter } from '@velastack/cms/server';
 *
 * const adapter = mockAdapter({ layoutDocs: {}, pageDocs: {} });
 *
 * export const load = async (event) => {
 *   const { cms, notFound, gone, redirectTo } = await loadCms(event, {
 *     locale: 'en',
 *     adapter
 *   });
 *   if (redirectTo) redirect(308, redirectTo);
 *   if (gone) error(410, 'Gone');
 *   if (notFound) error(404, 'Not found');
 *   return { cms };
 * };
 * ```
 */
export const loadCms = (
	event: ServerLoadEvent,
	options: LoadCmsOptions
): Promise<LoadCmsResult> => {
	if (browser) {
		throw new Error(
			"[@velastack/cms] loadCms() is server-only — call it from `+layout.server.ts` " +
				'or `+page.server.ts`, not from a `+page.svelte` or universal `+page.ts`. ' +
				"For browser-side preview/editing, use `cmsStore` from '@velastack/cms'."
		);
	}
	return resolveCmsPayload({
		manifest: builtManifest,
		routeId: event.route.id,
		params: event.params as Record<string, string>,
		previewKey: building ? null : event.url.searchParams.get('preview'),
		versionKey: building ? null : event.url.searchParams.get('version'),
		locale: options.locale,
		locales: options.locales,
		adapter: options.adapter,
		fetch: event.fetch
	});
};
