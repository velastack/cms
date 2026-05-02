import { mergeTree, type Tree } from '../components/cms/path.ts';
import type {
	CmsAdapter,
	CmsAdapterContext,
	CmsAdapterDoc,
	CmsEntry,
	CmsScopeQuery
} from './types.ts';

/**
 * One page-kind entry: a specific (`routeId`, `params`) pair and its
 * currently-published content. `routeId` is the SvelteKit route id (e.g.
 * `/(marketing)/rooms/[slug]`); `params` is the bound values for that route's
 * owned params (e.g. `{ slug: 'suite-1' }`). For static page routes (no owned
 * params) `params` is `{}` and there's exactly one entry per route id.
 *
 * Pending edits live in releases (see `_store.ts`), not on the entry — saving
 * a draft adds an item to the editor's open release rather than mutating the
 * published content here.
 */
export type PageEntry = {
	params: Record<string, string>;
	published: Record<string, unknown>;
};

/**
 * One pending change in an open release, snapshot for adapter overlay. Items
 * with `kind: 'page'` carry `params`; layout items don't (layouts have no
 * owned params). `kind: 'page-delete'` signals a staged page removal — in
 * preview, the adapter omits the matching page so it appears removed. The
 * `tree` is a partial tree that deep-merges over the published content.
 */
export type ReleaseItemSnapshot =
	| {
			kind: 'page';
			routeId: string;
			params: Record<string, string>;
			tree: Tree;
	  }
	| { kind: 'layout'; routeId: string; tree: Tree }
	| { kind: 'page-delete'; routeId: string; params: Record<string, string> };

export type ReleaseSnapshot = {
	id: string;
	items: ReleaseItemSnapshot[];
};

export type MockAdapterOptions = {
	/**
	 * Layout docs keyed by `routeId` (e.g. `/`, `/(marketing)`). Layouts have
	 * no owned params, so `routeId` alone identifies a layout doc.
	 */
	layoutDocs?: Record<string, Record<string, unknown>>;
	/**
	 * Page docs keyed by `routeId`, with one `PageEntry` per (`params`)
	 * combination. Stores only the currently-published content.
	 */
	pageDocs?: Record<string, PageEntry[]>;
	/**
	 * Look up an open release by its preview key. Called when a request
	 * carries `?preview=…` so adapter results overlay the matching release's
	 * pending edits onto published content.
	 */
	resolvePreview?: (previewKey: string) => ReleaseSnapshot | null | undefined;
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

const paramsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
	const aKeys = Object.keys(a);
	if (aKeys.length !== Object.keys(b).length) return false;
	for (const k of aKeys) if (a[k] !== b[k]) return false;
	return true;
};

const findReleaseItem = (
	snapshot: ReleaseSnapshot,
	q: CmsScopeQuery
): ReleaseItemSnapshot | undefined => {
	for (const item of snapshot.items) {
		if (q.kind === 'layout') {
			if (item.kind === 'layout' && item.routeId === q.routeId) return item;
		} else {
			if (item.kind === 'layout') continue;
			if (item.routeId === q.routeId && paramsEqual(item.params, q.params)) {
				return item;
			}
		}
	}
	return undefined;
};

const isPageDeleted = (
	snapshot: ReleaseSnapshot,
	routeId: string,
	params: Record<string, string>
): boolean => {
	for (const item of snapshot.items) {
		if (item.kind !== 'page-delete') continue;
		if (item.routeId === routeId && paramsEqual(item.params, params)) return true;
	}
	return false;
};

/**
 * Merge a release item's tree onto a published document via deep-merge.
 * Plain-object branches deep-merge; arrays replace wholesale (so a repeater
 * reorder doesn't accidentally concat with the previous order). Only
 * tree-bearing variants (page / layout) reach this helper — page-delete is
 * handled separately by the caller.
 */
type ReleaseFieldItem = Exclude<ReleaseItemSnapshot, { kind: 'page-delete' }>;

const applyOverlay = (base: Tree | undefined, item: ReleaseFieldItem): Tree =>
	mergeTree(base ?? {}, item.tree);

/**
 * In-memory {@link CmsAdapter} useful for tests, demos, and local development
 * before a real backend is wired up.
 *
 * Layout queries are looked up by `routeId`; page queries by `routeId` +
 * exact `params` map. When `context.previewKey` is set and matches an open
 * release (via `resolvePreview`), pending edits in that release overlay the
 * published content for any matching scope. Without a preview key, queries
 * always return the published content.
 */
export const mockAdapter = (options: MockAdapterOptions = {}): CmsAdapter => {
	const layoutDocs = options.layoutDocs ?? {};
	const pageDocs = options.pageDocs ?? {};
	const resolvePreview = options.resolvePreview;

	return {
		fetchDocs(queries: CmsScopeQuery[], context: CmsAdapterContext) {
			const previewKey = context.previewKey;
			const release = previewKey && resolvePreview ? resolvePreview(previewKey) : null;

			const out: Record<string, CmsAdapterDoc> = {};
			for (const q of queries) {
				let base: Record<string, unknown> | undefined;
				if (q.kind === 'page') {
					const entry = findPageEntry(pageDocs[q.routeId], q.params);
					base = entry?.published;
				} else {
					base = layoutDocs[q.routeId];
				}

				if (release && q.kind === 'page' && isPageDeleted(release, q.routeId, q.params)) {
					continue;
				}

				const overlayItem = release ? findReleaseItem(release, q) : undefined;
				if (overlayItem && overlayItem.kind !== 'page-delete') {
					out[q.scopeId] = { contents: applyOverlay(base, overlayItem) };
				} else if (base) {
					out[q.scopeId] = { contents: base };
				}
			}
			return out;
		},

		fetchEntries(routeId: string, context: CmsAdapterContext) {
			const entries = pageDocs[routeId];
			if (!entries) return [];
			const previewKey = context.previewKey;
			const release = previewKey && resolvePreview ? resolvePreview(previewKey) : null;
			const out: CmsEntry[] = [];
			const metaOf = (tree: Tree | undefined): Record<string, unknown> => {
				const m = tree?.metadata;
				return m && typeof m === 'object' && !Array.isArray(m)
					? (m as Record<string, unknown>)
					: {};
			};
			for (const e of entries) {
				if (release && isPageDeleted(release, routeId, e.params)) continue;
				out.push({ params: { ...e.params }, metadata: metaOf(e.published as Tree) });
			}
			if (release) {
				for (const item of release.items) {
					if (item.kind !== 'page' || item.routeId !== routeId) continue;
					if (findPageEntry(entries, item.params)) continue;
					out.push({ params: { ...item.params }, metadata: metaOf(item.tree) });
				}
			}
			return out;
		}
	};
};
