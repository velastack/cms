import type { CmsAdapter, CmsAdapterDoc, CmsScopeQuery } from './types.js';

export type CmsStatus = 'draft' | 'published';

/**
 * One stored version of a page-kind document. `versions` arrays are ordered
 * arbitrarily; resolution is by `version` and `status`, not array position.
 */
export type PageVersion = {
	version: number;
	status: CmsStatus;
	preview_key: string;
	contents: Record<string, unknown>;
};

/**
 * One page-kind entry: a specific (`routeId`, `params`) pair and all its
 * stored versions. `routeId` is the SvelteKit route id (e.g.
 * `/(marketing)/rooms/[slug]`); `params` is the bound values for that route's
 * owned params (e.g. `{ slug: 'suite-1' }`). For static page routes (no owned
 * params) `params` is `{}` and there's exactly one entry per route id.
 */
export type PageEntry = {
	params: Record<string, string>;
	versions: PageVersion[];
};

export type MockAdapterOptions = {
	/**
	 * Layout docs keyed by `routeId` (e.g. `/`, `/(marketing)`). Layouts have
	 * no owned params, so `routeId` alone identifies a layout doc.
	 */
	layoutDocs?: Record<string, Record<string, unknown>>;
	/**
	 * Page docs keyed by `routeId`, with one `PageEntry` per (`params`)
	 * combination. `loadLatestPublished` is the default version resolution;
	 * specific versions are addressable via the `?version`/`?preview` URL
	 * params.
	 */
	pageDocs?: Record<string, PageEntry[]>;
};

const findLatestPublished = (versions: PageVersion[]): PageVersion | undefined => {
	let best: PageVersion | undefined;
	for (const v of versions) {
		if (v.status !== 'published') continue;
		if (!best || v.version > best.version) best = v;
	}
	return best;
};

/** Match a `PageEntry` whose `params` map equals the requested params. */
export const findPageEntry = (
	entries: PageEntry[] | undefined,
	params: Record<string, string>
): PageEntry | undefined => {
	if (!entries) return undefined;
	const keys = Object.keys(params);
	for (const entry of entries) {
		const entryKeys = Object.keys(entry.params);
		if (entryKeys.length !== keys.length) continue;
		let match = true;
		for (const k of keys) {
			if (entry.params[k] !== params[k]) {
				match = false;
				break;
			}
		}
		if (match) return entry;
	}
	return undefined;
};

/**
 * In-memory {@link CmsAdapter} useful for tests, demos, and local development
 * before a real backend is wired up.
 *
 * Layout queries are looked up by `routeId`. Page queries match by `routeId`
 * + exact `params` map, then resolve a version with this rule:
 *
 *   - If `query.version` is unset, return the latest published version.
 *   - If `query.version` is the latest published version, return it (no
 *     `previewKey` required — public traffic with a `?version=` pin still
 *     works as long as it points at the live published version).
 *   - Otherwise the doc's `preview_key` must equal `query.previewKey`. On
 *     mismatch (or unknown version) the doc is omitted, which `loadCms`
 *     translates into a 404.
 */
export const mockAdapter = (options: MockAdapterOptions = {}): CmsAdapter => {
	const layoutDocs = options.layoutDocs ?? {};
	const pageDocs = options.pageDocs ?? {};

	const resolvePage = (q: CmsScopeQuery): PageVersion | null => {
		const entry = findPageEntry(pageDocs[q.routeId], q.params);
		if (!entry || entry.versions.length === 0) return null;

		const latestPublished = findLatestPublished(entry.versions);

		if (q.version == null) {
			return latestPublished ?? null;
		}

		const target = entry.versions.find((v) => v.version === q.version);
		if (!target) return null;
		if (latestPublished && target.version === latestPublished.version) return target;
		if (!q.previewKey || q.previewKey !== target.preview_key) return null;
		return target;
	};

	return {
		fetchDocs(queries: CmsScopeQuery[]) {
			const out: Record<string, CmsAdapterDoc> = {};
			for (const q of queries) {
				if (q.kind === 'page') {
					const resolved = resolvePage(q);
					if (resolved) {
						out[q.scopeId] = {
							contents: resolved.contents,
							version: resolved.version,
							status: resolved.status
						};
					}
				} else {
					const doc = layoutDocs[q.routeId];
					if (doc) out[q.scopeId] = { contents: doc };
				}
			}
			return out;
		},

		fetchEntries(routeId: string) {
			const entries = pageDocs[routeId];
			if (!entries) return [];
			const out: Record<string, string>[] = [];
			for (const e of entries) {
				if (!e.versions.some((v) => v.status === 'published')) continue;
				out.push({ ...e.params });
			}
			return out;
		}
	};
};
