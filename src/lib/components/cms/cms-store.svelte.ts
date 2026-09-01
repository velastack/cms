/**
 * Reactive edit-mode store for CMS components.
 *
 * Every (scope, locale) owns one tree. `drafts[key].tree` holds the editor's
 * local, uncommitted patch tree; `overlay[key]` holds merged
 * published+release content fetched client-side from `${endpoint}/docs` for
 * that locale. Display components read through `getValue(scope, path)`,
 * which deep-merges `base ∪ overlay ∪ draft` (drafts only when `isEditing`)
 * and returns the value at `path`. The `base` is the request-time doc on
 * `page.data.cms` (already locale-resolved + fallback-merged by the
 * server-side `resolveCmsPayload`); `overlay` and `draft` are scoped to the
 * locale stored on the bucket.
 *
 * `save(endpoint)` flushes draft trees to `${endpoint}/release/items` as
 * `{ items: [{ kind, routeId, [params], locale, tree }] }`. The server
 * deep-merges each tree into the editor's open release, keyed by
 * (scope, locale). Publishing is a separate deliberate step via
 * `/release/publish`.
 *
 * Paths are lodash-style: `welcome.title`, `gallery.0.caption`,
 * `metadata.openGraph.image.url`. Numeric segments index arrays. There is no
 * special envelope for metadata — `metadata` is just a branch on the page
 * scope's tree.
 *
 * Locale on read/write helpers (`getValue`, `setValue`, `hasDraft`,
 * `hasOverlay`) defaults to the request's `page.data.cms.locale`. The
 * Locales panel passes an explicit locale to inspect other locales'
 * working-copy state without switching the page.
 */
import { browser } from '$app/environment';
import { page } from '$app/state';
import { mergeLocaleDocs, mergeLocaleEntries } from './locale-merge.js';
import { composeKey } from './overlay-sync.js';
import { get, has, mergeTree, set, type Tree } from '../../core/path.js';
import type { MediaItem, OpenRelease, PageDeleteOutcome, ReleaseItem } from '../../core/wire.js';
import type { CmsEntry, CmsPagePointer, CmsPayload, CmsScopeEntry } from './scope.js';

// Re-exported: admin-bar components import these from the store today.
export type { MediaItem, OpenRelease, PageDeleteOutcome, ReleaseItem };

export type CmsScopeRef = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
};

type DraftBucket = {
	scope: CmsScopeRef;
	locale: string;
	tree: Tree;
};

const scopeKindFromId = (scopeId: string): 'page' | 'layout' =>
	scopeId.startsWith('layout:') ? 'layout' : 'page';

/**
 * Fully qualify a media URL against the CMS endpoint.
 *
 * The backend may return a root-relative path (`/uploads/<slug>.png`) — that is
 * the default for a same-origin mount, and it keeps the origin out of persisted
 * content. When the CMS lives on a different origin than the site, resolving
 * that path against `location.href` would point at the site, so it is resolved
 * against the endpoint instead. Absolute URLs are returned untouched.
 *
 * This used to be a hardcoded `https://velastack.dev`, which was silently wrong
 * for every other deployment.
 */
const resolveMediaItem = (item: MediaItem, endpoint: string): MediaItem => {
	if (!item.url.startsWith('/')) return item;
	try {
		const base = new URL(endpoint, browser ? location.href : 'http://localhost');
		return { ...item, url: new URL(item.url, base).toString() };
	} catch {
		return item;
	}
};

const treeHasAnyLeaf = (tree: Tree): boolean => {
	for (const v of Object.values(tree)) {
		if (v === undefined) continue;
		return true;
	}
	return false;
};

/** Read the request-time locale from `page.data.cms`. Empty string until a payload loads. */
const pageLocale = (): string => {
	const cms = page.data?.cms as CmsPayload | undefined;
	return cms?.locale ?? '';
};

/**
 * Default (fallback) locale for the project — `cms.locales[0]` by convention
 * (matches `resolveCmsPayload`). Used by `loadAndApply*` to fetch the default
 * locale's content alongside the requested one for `requested → default`
 * fallback merging.
 */
const pageDefaultLocale = (): string => {
	const cms = page.data?.cms as CmsPayload | undefined;
	return cms?.locales?.[0] ?? cms?.locale ?? '';
};

class CmsStore {
	isEditing = $state(false);
	drafts = $state<Record<string, DraftBucket>>({});
	openRelease = $state<OpenRelease | null>(null);
	overlay = $state<Record<string, Tree>>({});
	/** Per-routeId entries overlay populated by `loadAndApplyEntriesOverlay`. */
	entriesOverlay = $state<Record<string, CmsEntry[]>>({});
	/**
	 * Project-global site bucket. Not localized, not route-bound. `siteOverlay`
	 * holds the merged published+open-release tree fetched client-side from
	 * `${endpoint}/site`; `siteDraft` holds in-flight Site Settings panel
	 * edits awaiting save. `cmsStore.site` returns the merged read of base
	 * (load payload) ∪ overlay ∪ draft.
	 */
	siteOverlay = $state<Tree | undefined>(undefined);
	siteDraft = $state<Tree>({});
	/**
	 * Active editor preview locale, pushed in by the admin bar from the URL
	 * (`?locale=`). Falls back to `page.data.cms.locale` when unset (read-only
	 * consumer, or no override). Field components read/write through the
	 * default locale below, so editing in `?locale=es` keys drafts to `es`
	 * even if the consumer's `getLocale(url)` doesn't honor the param.
	 */
	private _activeLocale = $state<string | null>(null);
	private overlayFetchToken = 0;
	private entriesFetchToken = 0;

	toggleEdit(): void {
		this.isEditing = !this.isEditing;
	}

	setActiveLocale(locale: string | null): void {
		this._activeLocale = locale || null;
	}

	private effectiveLocale(): string {
		return this._activeLocale ?? pageLocale();
	}

	/** Base doc (server-rendered) for a scope. Already locale-resolved by `resolveCmsPayload`. */
	private baseDoc(scope: CmsScopeRef): Tree {
		const cms = page.data?.cms as CmsPayload | undefined;
		return (cms?.docs?.[scope.scopeId] ?? {}) as Tree;
	}

	/** Merged read tree: base ∪ overlay (∪ draft when editing) for the given locale. */
	private mergedTree(scope: CmsScopeRef, locale: string): Tree {
		const key = composeKey(scope, locale);
		// Only fold in base when the requested locale matches the page's
		// resolved locale — `page.data.cms.docs` only carries that one.
		const base = locale === pageLocale() ? this.baseDoc(scope) : {};
		const ov = this.overlay[key];
		const draft = this.isEditing ? this.drafts[key]?.tree : undefined;
		return mergeTree(base, ov, draft);
	}

	/** Read the merged value at `path`. Returns `undefined` if missing. */
	getValue(scope: CmsScopeRef, path: string, locale?: string): unknown {
		return get(this.mergedTree(scope, locale ?? this.effectiveLocale()), path);
	}

	/** Whether the editor's draft tree contains a value at `path`. */
	hasDraft(scope: CmsScopeRef, path: string, locale?: string): boolean {
		const bucket = this.drafts[composeKey(scope, locale ?? this.effectiveLocale())];
		return bucket ? has(bucket.tree, path) : false;
	}

	/** Whether the client overlay (published+release) contains a value at `path`. */
	hasOverlay(scope: CmsScopeRef, path: string, locale?: string): boolean {
		const ov = this.overlay[composeKey(scope, locale ?? this.effectiveLocale())];
		return ov ? has(ov, path) : false;
	}

	/** Write a value at `path` into the draft tree. Creates the bucket if needed. */
	setValue(scope: CmsScopeRef, path: string, value: unknown, locale?: string): void {
		const lc = locale ?? this.effectiveLocale();
		const key = composeKey(scope, lc);
		const bucket = this.drafts[key] ?? (this.drafts[key] = { scope, locale: lc, tree: {} });
		set(bucket.tree, path, value);
	}

	clearOverlay(): void {
		this.overlay = {};
		this.entriesOverlay = {};
		this.siteOverlay = undefined;
	}

	/**
	 * Reactive merged site tree: base (load payload) ∪ overlay (client-fetched
	 * `/site` response with preview overlay) ∪ draft (Site Settings panel
	 * edits awaiting save). Reads update live, so a value typed in the panel
	 * appears on the page immediately.
	 *
	 * Drafts are always folded in here (no `isEditing` gate) — the panel
	 * commits to the draft via `setSiteValue` only on Save, so any value
	 * present is already an intentional staged change.
	 */
	get site(): Record<string, unknown> {
		const baseSite = (page.data?.cms as CmsPayload | undefined)?.site?.tree ?? {};
		return mergeTree(baseSite as Tree, this.siteOverlay, this.siteDraft);
	}

	getSiteValue(path: string): unknown {
		return get(this.site, path);
	}

	setSiteValue(path: string, value: unknown): void {
		set(this.siteDraft, path, value);
	}

	hasSiteDraft(path?: string): boolean {
		if (!path) return treeHasAnyLeaf(this.siteDraft);
		return has(this.siteDraft, path);
	}

	clearSiteDraft(): void {
		this.siteDraft = {};
	}

	/**
	 * Fetch the merged published+release site tree from `${endpoint}/site`
	 * and apply as a client-side overlay. With `previewKey` the response
	 * includes the user's open-release site item; without it (or with
	 * `versionKey`), the response is published-only / past-snapshot.
	 */
	async loadAndApplySiteOverlay(
		endpoint: string,
		previewKey: string | null,
		opts: { versionKey?: string | null } = {}
	): Promise<void> {
		const versionKey = opts.versionKey ?? null;
		const qs = new URLSearchParams();
		if (versionKey) qs.set('version', versionKey);
		else if (previewKey) qs.set('preview', previewKey);
		const suffix = qs.toString() ? `?${qs}` : '';
		try {
			const res = await fetch(`${endpoint}/site${suffix}`, { credentials: 'include' });
			if (!res.ok) return;
			const data = (await res.json()) as { contents: Tree };
			this.siteOverlay = data.contents ?? {};
		} catch {
			/* network errors are non-fatal — display falls through to base */
		}
	}

	/**
	 * Fetch merged published+release content for each scope on the current
	 * route via `${endpoint}/docs` and apply as a client-side overlay.
	 *
	 * `previewKey` selects the user's open release on the server; pass `null`
	 * to fetch published-only content (used post-publish to mask the now-stale
	 * `page.data.cms.docs` on static-export sites).
	 *
	 * `opts.versionKey` (mutually exclusive with `previewKey`) requests the
	 * snapshot at a published release's publish time — `?version=…`.
	 *
	 * `opts.locale` is the BCP-47 locale to request — required, scopes the
	 * overlay cache key so different locales don't collide.
	 *
	 * `opts.defaultLocale` (the consumer's `cms.locales[0]`) enables the
	 * fallback fetch: when `locale !== defaultLocale`, we fetch the default
	 * locale's content in parallel and `mergeLocaleDocs` it under the
	 * requested locale. Adapters return only what's stored for the requested
	 * locale (per the mock-adapter contract); the library composes the
	 * `requested → default → undefined` chain. Mirrors `resolveCmsPayload`.
	 *
	 * `opts.reset` replaces the overlay map wholesale (mount with release,
	 * post-publish, post-discard). Otherwise we merge — keeps unchanged-layout
	 * overlays applied during navigation while new-page scopes load.
	 */
	async loadAndApplyOverlay(
		endpoint: string,
		scopes: CmsScopeEntry[],
		previewKey: string | null,
		opts: {
			reset?: boolean;
			versionKey?: string | null;
			locale: string;
			defaultLocale?: string;
		}
	): Promise<void> {
		const token = ++this.overlayFetchToken;
		const versionKey = opts.versionKey ?? null;
		const locale = opts.locale;
		const defaultLocale = opts.defaultLocale ?? pageDefaultLocale() ?? locale;
		const needsFallback = !!defaultLocale && locale !== defaultLocale;

		const fetchScope = async (scope: CmsScopeEntry, forLocale: string) => {
			const qs = new URLSearchParams({
				kind: scope.kind,
				routeId: scope.routeId,
				params: JSON.stringify(scope.params),
				locale: forLocale
			});
			if (versionKey) qs.set('version', versionKey);
			else if (previewKey) qs.set('preview', previewKey);
			const res = await fetch(`${endpoint}/docs?${qs}`, { credentials: 'include' });
			if (!res.ok) return null;
			const data = (await res.json()) as { contents: Tree };
			return { scope, contents: data.contents };
		};

		const collect = (
			pairs: Array<{ scope: CmsScopeEntry; contents: Tree } | null>
		): Record<string, Tree> => {
			const out: Record<string, Tree> = {};
			for (const r of pairs) {
				if (!r) continue;
				out[r.scope.scopeId] = r.contents ?? {};
			}
			return out;
		};

		const [requestedPairs, fallbackPairs] = await Promise.all([
			Promise.all(scopes.map((s) => fetchScope(s, locale))),
			needsFallback
				? Promise.all(scopes.map((s) => fetchScope(s, defaultLocale)))
				: Promise.resolve(null as Array<{ scope: CmsScopeEntry; contents: Tree } | null> | null)
		]);
		if (token !== this.overlayFetchToken) return;

		const merged = mergeLocaleDocs(
			collect(requestedPairs),
			fallbackPairs ? collect(fallbackPairs) : null
		);

		const scopeIndex = new Map<string, CmsScopeEntry>();
		for (const s of scopes) scopeIndex.set(s.scopeId, s);

		const next: Record<string, Tree> = {};
		for (const [scopeId, contents] of Object.entries(merged)) {
			const scope = scopeIndex.get(scopeId);
			if (!scope) continue;
			const key = composeKey(
				{ scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params },
				locale
			);
			next[key] = contents;
		}

		if (opts.reset) {
			this.overlay = next;
		} else {
			this.overlay = { ...this.overlay, ...next };
		}
	}

	/**
	 * Refresh the per-routeId entries overlay used by `<CmsEntries>`. One fetch
	 * to `${endpoint}/pages?preview=…&locale=…` covers all `routeIds`; we
	 * filter the response per route. With `previewKey` set, draft and
	 * pending-delete entries are kept; with `previewKey === null`, they're
	 * filtered out — used post-publish to mask stale
	 * `page.data.cms.entries` on static-export sites.
	 *
	 * `opts.defaultLocale` enables the fallback fetch: when the requested
	 * locale isn't the default, we fetch the default locale's entries in
	 * parallel and union by params (requested-locale entries win on metadata
	 * for shared params; default-locale-only entries surface as fallbacks).
	 */
	async loadAndApplyEntriesOverlay(
		endpoint: string,
		routeIds: string[],
		previewKey: string | null,
		opts: {
			reset?: boolean;
			versionKey?: string | null;
			locale: string;
			defaultLocale?: string;
		}
	): Promise<void> {
		const token = ++this.entriesFetchToken;
		if (routeIds.length === 0) {
			if (opts.reset) this.entriesOverlay = {};
			return;
		}

		const versionKey = opts.versionKey ?? null;
		const defaultLocale = opts.defaultLocale ?? pageDefaultLocale() ?? opts.locale;
		const needsFallback = !!defaultLocale && opts.locale !== defaultLocale;

		const fetchByLocale = async (forLocale: string): Promise<Record<string, CmsEntry[]> | null> => {
			const qs = new URLSearchParams({ locale: forLocale });
			if (versionKey) qs.set('version', versionKey);
			else if (previewKey) qs.set('preview', previewKey);
			let res: Response;
			try {
				res = await fetch(`${endpoint}/pages?${qs}`, { credentials: 'include' });
			} catch {
				return null;
			}
			if (!res.ok) return null;

			const body = (await res.json()) as {
				routes: Array<{
					routeId: string;
					entries: Array<{
						params: Record<string, string>;
						isDraft?: boolean;
						isDeletePending?: boolean;
						redirectTo?: string;
						gone?: boolean;
						metadata?: Record<string, unknown>;
					}>;
				}>;
			};

			const out: Record<string, CmsEntry[]> = {};
			const wanted = new Set(routeIds);
			for (const r of body.routes) {
				if (!wanted.has(r.routeId)) continue;
				// Tombstones (redirect / gone) and pending deletes never appear in
				// consumer-facing `<CmsEntries>` lists. Drafts are visible only in
				// preview / version mode where the editor inspects working state.
				const filtered = r.entries.filter((e) => {
					if (e.redirectTo || e.gone || e.isDeletePending) return false;
					if (versionKey || previewKey) return true;
					return !e.isDraft;
				});
				out[r.routeId] = filtered.map((e) => ({
					params: e.params,
					metadata: e.metadata ?? {}
				}));
			}
			return out;
		};

		const [requested, fallback] = await Promise.all([
			fetchByLocale(opts.locale),
			needsFallback ? fetchByLocale(defaultLocale) : Promise.resolve(null)
		]);
		if (token !== this.entriesFetchToken) return;
		if (!requested) return;

		const merged = mergeLocaleEntries(requested, fallback);
		const next: Record<string, CmsEntry[]> = { ...merged };
		for (const rid of routeIds) {
			if (!(rid in next)) next[rid] = [];
		}

		if (opts.reset) {
			this.entriesOverlay = next;
		} else {
			this.entriesOverlay = { ...this.entriesOverlay, ...next };
		}
	}

	get isDirty(): boolean {
		for (const bucket of Object.values(this.drafts)) {
			if (treeHasAnyLeaf(bucket.tree)) return true;
		}
		if (treeHasAnyLeaf(this.siteDraft)) return true;
		return false;
	}

	/**
	 * Counts distinct page identities and layout routes touched by the open
	 * release, NOT raw item count: a page edited in `en` and `es` registers
	 * as one. Powers the editor's "X pages draft" mental model — they think
	 * "one page is in progress", not "two storage rows exist". For per-locale
	 * breakdowns (locales panel "EN: 6, ES: 4"), use `workingCopyCountsByLocale`.
	 */
	get workingCopyCounts(): { pages: number; layouts: number; site: number; total: number } {
		const pageKeys = new Set<string>();
		const layoutKeys = new Set<string>();
		let site = 0;
		for (const item of this.openRelease?.items ?? []) {
			if (item.kind === 'site') {
				site = 1;
			} else if (item.kind === 'layout') {
				layoutKeys.add(item.routeId);
			} else {
				const sortedParams = Object.keys(item.params).sort();
				const qp = sortedParams.map((k) => `${k}=${item.params[k]}`).join('&');
				pageKeys.add(`${item.routeId}?${qp}`);
			}
		}
		return {
			pages: pageKeys.size,
			layouts: layoutKeys.size,
			site,
			total: pageKeys.size + layoutKeys.size + site
		};
	}

	/**
	 * Per-locale breakdown of the open release's working-copy items. Powers
	 * the Locales panel ("default has 6 edits, es missing 2"). Locales with
	 * zero items don't appear in the map; the panel iterates `cms.locales` to
	 * surface them as "0 edits".
	 */
	get workingCopyCountsByLocale(): Record<
		string,
		{ pages: number; layouts: number; total: number }
	> {
		const out: Record<string, { pages: number; layouts: number; total: number }> = {};
		for (const item of this.openRelease?.items ?? []) {
			if (item.kind === 'site') continue;
			const bucket = (out[item.locale] ??= { pages: 0, layouts: 0, total: 0 });
			if (item.kind === 'layout') bucket.layouts += 1;
			else bucket.pages += 1;
			bucket.total += 1;
		}
		return out;
	}

	clearDrafts(): void {
		this.drafts = {};
		this.siteDraft = {};
	}

	setOpenRelease(release: OpenRelease | null): void {
		this.openRelease = release;
	}

	async fetchOpenRelease(endpoint: string): Promise<void> {
		const res = await fetch(`${endpoint}/release`, { credentials: 'include' });
		if (!res.ok) {
			this.openRelease = null;
			return;
		}
		const data = (await res.json()) as { release: OpenRelease | null };
		this.openRelease = data.release;
	}

	/**
	 * Atomically rename a page's slug: stage a draft `page` item at the new
	 * params copying content from the published entry, plus a `page-delete`
	 * with a redirect outcome on the old params pointing at the new URL. Both
	 * items go into the open release as a transactional pair, so undo removes
	 * them together. The backend composes this on `POST /pages/rename`.
	 */
	async renameSlug(
		endpoint: string,
		args: {
			routeId: string;
			fromParams: Record<string, string>;
			toParams: Record<string, string>;
			locale: string;
			toUrl: string;
		}
	): Promise<{ ok: boolean; release?: OpenRelease }> {
		const res = await fetch(`${endpoint}/pages/rename`, {
			credentials: 'include',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(args)
		});
		if (!res.ok) return { ok: false };
		const data = (await res.json()) as { release: OpenRelease };
		this.openRelease = data.release;
		return { ok: true, release: data.release };
	}

	/**
	 * Upload a media file to `${endpoint}/media` and return the full `MediaItem`.
	 * The library panel and inline picker both call this so newly-uploaded items
	 * can be prepended to local state without a re-list.
	 */
	async uploadMedia(endpoint: string, file: File): Promise<MediaItem> {
		const formData = new FormData();
		formData.append('file', file);
		const res = await fetch(`${endpoint}/media`, {
			method: 'POST',
			body: formData,
			credentials: 'include'
		});
		if (!res.ok) {
			throw new Error(`Upload failed (${res.status})`);
		}
		const item = (await res.json()) as MediaItem;
		if (typeof item?.url !== 'string') {
			throw new Error('Upload response missing url');
		}
		return resolveMediaItem(item, endpoint);
	}

	/** Back-compat wrapper around `uploadMedia` that returns just the URL. */
	async uploadImage(endpoint: string, file: File): Promise<string> {
		return (await this.uploadMedia(endpoint, file)).url;
	}

	async listMedia(
		endpoint: string,
		params: { offset?: number; limit?: number } = {}
	): Promise<{ items: MediaItem[]; total: number }> {
		const qs = new URLSearchParams();
		if (params.offset != null) qs.set('offset', String(params.offset));
		if (params.limit != null) qs.set('limit', String(params.limit));
		const res = await fetch(`${endpoint}/media?${qs}`, { credentials: 'include' });
		if (!res.ok) throw new Error(`List failed (${res.status})`);
		const data = (await res.json()) as { items: MediaItem[]; total: number };
		return { ...data, items: data.items.map((i) => resolveMediaItem(i, endpoint)) };
	}

	async deleteMedia(endpoint: string, id: string): Promise<void> {
		const res = await fetch(`${endpoint}/media/${id}`, {
			method: 'DELETE',
			credentials: 'include'
		});
		if (!res.ok) throw new Error(`Delete failed (${res.status})`);
	}

	/**
	 * Flush dirty drafts to the server's open release as one item per
	 * (scope, locale), each carrying a partial tree. The server deep-merges
	 * each tree into its matching item in the working copy without publishing.
	 */
	async save(endpoint: string): Promise<{ ok: boolean; release?: OpenRelease }> {
		type SaveInput =
			| {
					kind: 'page';
					routeId: string;
					params: Record<string, string>;
					locale: string;
					tree: Tree;
			  }
			| { kind: 'layout'; routeId: string; locale: string; tree: Tree }
			| { kind: 'site'; tree: Tree };

		const items: SaveInput[] = [];
		for (const bucket of Object.values(this.drafts)) {
			if (!treeHasAnyLeaf(bucket.tree)) continue;
			const kind = scopeKindFromId(bucket.scope.scopeId);
			if (kind === 'page') {
				items.push({
					kind: 'page',
					routeId: bucket.scope.routeId,
					params: bucket.scope.params,
					locale: bucket.locale,
					tree: bucket.tree
				});
			} else {
				items.push({
					kind: 'layout',
					routeId: bucket.scope.routeId,
					locale: bucket.locale,
					tree: bucket.tree
				});
			}
		}
		if (treeHasAnyLeaf(this.siteDraft)) {
			items.push({ kind: 'site', tree: this.siteDraft });
		}

		if (items.length === 0) return { ok: true, release: this.openRelease ?? undefined };

		const res = await fetch(`${endpoint}/release/items`, {
			credentials: 'include',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ items })
		});
		if (!res.ok) return { ok: false };
		const data = (await res.json()) as { release: OpenRelease };
		this.openRelease = data.release;
		this.clearDrafts();
		return { ok: true, release: data.release };
	}
}

export const cmsStore = new CmsStore();

/**
 * Public read view of the merged CMS payload: server-loaded `page.data.cms`
 * with `cmsStore.overlay` applied on top, so authed editors see working-copy
 * content without a server reload.
 *
 * Shape mirrors `CmsPayload` directly via getters (`cms.docs`, `cms.metadata`,
 * `cms.page`, …). `metadata` is now a thin alias — it reads the page scope's
 * `metadata` branch from the merged docs.
 */
class Cms {
	#merged = $derived.by((): CmsPayload | null => {
		const base = (page.data?.cms ?? null) as CmsPayload | null;
		if (!base) return null;

		const docs: Record<string, Tree> = {};
		for (const [scopeId, scopeEntry] of Object.entries(base.scopes)) {
			const overlayKey = composeKey(
				{
					scopeId: scopeEntry.scopeId,
					routeId: scopeEntry.routeId,
					params: scopeEntry.params
				},
				base.locale
			);
			const overlayBucket = cmsStore.overlay[overlayKey];
			const baseDoc = (base.docs[scopeId] ?? {}) as Tree;
			docs[scopeId] = overlayBucket ? mergeTree(baseDoc, overlayBucket) : baseDoc;
		}

		let metadata = base.metadata;
		if (base.page) {
			const pageDoc = docs[base.page.scopeId] as Tree | undefined;
			const meta = pageDoc?.metadata;
			if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
				metadata = meta as Record<string, unknown>;
			}
		}

		const entries: Record<string, CmsEntry[]> = {
			...(base.entries ?? {}),
			...cmsStore.entriesOverlay
		};

		return { ...base, docs, metadata, entries };
	});

	get locale(): string {
		return this.#merged?.locale ?? '';
	}
	get locales(): string[] {
		return this.#merged?.locales ?? [];
	}
	get docs(): Record<string, Record<string, unknown>> {
		return this.#merged?.docs ?? {};
	}
	get scopes(): Record<string, CmsScopeEntry> {
		return this.#merged?.scopes ?? {};
	}
	get metadata(): Record<string, unknown> {
		return this.#merged?.metadata ?? {};
	}
	get entries(): Record<string, CmsEntry[]> {
		return this.#merged?.entries ?? {};
	}
	get endpoint(): string {
		return this.#merged?.endpoint ?? '';
	}
	get page(): CmsPagePointer | null {
		return this.#merged?.page ?? null;
	}
	/**
	 * Project-wide site settings tree, merged through `cmsStore.site` so panel
	 * edits show up live in preview. Use this in display components instead of
	 * reading `data.cms.site.tree` directly — that's only the SSR seed.
	 */
	get site(): Record<string, unknown> {
		return cmsStore.site;
	}
}

export const cms = new Cms();
