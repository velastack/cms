/**
 * Reactive edit-mode store for CMS components.
 *
 * Every scope owns one tree. `drafts[key].tree` holds the editor's local,
 * uncommitted patch tree; `overlay[key]` holds merged published+release
 * content fetched client-side from `${endpoint}/docs`. Display components
 * read through `getValue(scope, path)`, which deep-merges
 * `base ∪ overlay ∪ draft` (drafts only when `isEditing`) and returns the
 * value at `path`.
 *
 * `save(endpoint)` flushes draft trees to `${endpoint}/release/items` as
 * `{ items: [{ kind, routeId, [params], tree }] }`. The server deep-merges
 * each tree into the editor's open release. Publishing is a separate
 * deliberate step via `/release/publish`.
 *
 * Paths are lodash-style: `welcome.title`, `gallery.0.caption`,
 * `metadata.openGraph.image.url`. Numeric segments index arrays. There is no
 * special envelope for metadata — `metadata` is just a branch on the page
 * scope's tree.
 */
import { page } from '$app/state';
import { get, has, mergeTree, set, type Tree } from './path.js';
import type { CmsEntry, CmsPagePointer, CmsPayload, CmsScopeEntry } from './scope.js';

export type CmsScopeRef = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
};

type DraftBucket = {
	scope: CmsScopeRef;
	tree: Tree;
};

const composeKey = (scope: CmsScopeRef): string => {
	const keys = Object.keys(scope.params).sort();
	if (keys.length === 0) return scope.scopeId;
	const qp = keys.map((k) => `${k}=${scope.params[k]}`).join('&');
	return `${scope.scopeId}?${qp}`;
};

export type ReleaseItem =
	| {
			kind: 'page';
			routeId: string;
			params: Record<string, string>;
			tree: Tree;
			addedAt: string;
	  }
	| { kind: 'layout'; routeId: string; tree: Tree; addedAt: string }
	| {
			kind: 'page-delete';
			routeId: string;
			params: Record<string, string>;
			addedAt: string;
	  };

export type OpenRelease = {
	userId: string;
	name?: string;
	createdAt: string;
	preview_key: string;
	items: ReleaseItem[];
};

/**
 * Wire shape of a media library item, mirroring the server's `MediaItem`.
 * `url` is the public path served by the static handler (e.g. `/uploads/abc.png`).
 */
export type MediaItem = {
	id: string;
	filename: string;
	originalName: string;
	mime: string;
	size: number;
	url: string;
	uploadedAt: string;
	uploadedBy: string;
};

const scopeKindFromId = (scopeId: string): 'page' | 'layout' =>
	scopeId.startsWith('layout:') ? 'layout' : 'page';

/**
 * Origin where uploaded media files are served. The backend writes files to
 * `static/uploads/` and returns relative paths like `/uploads/<slug>.png`; the
 * frontend lives on a different origin in dev, so we prefix each URL here at
 * the wire boundary so display components and persisted field values both get
 * a fully-qualified URL.
 */
export const MEDIA_URL_PREFIX = 'http://localhost:5174';

const resolveMediaItem = (item: MediaItem): MediaItem =>
	item.url.startsWith('/') ? { ...item, url: `${MEDIA_URL_PREFIX}${item.url}` } : item;

const treeHasAnyLeaf = (tree: Tree): boolean => {
	for (const v of Object.values(tree)) {
		if (v === undefined) continue;
		return true;
	}
	return false;
};

class CmsStore {
	isEditing = $state(false);
	drafts = $state<Record<string, DraftBucket>>({});
	openRelease = $state<OpenRelease | null>(null);
	overlay = $state<Record<string, Tree>>({});
	/** Per-routeId entries overlay populated by `loadAndApplyEntriesOverlay`. */
	entriesOverlay = $state<Record<string, CmsEntry[]>>({});
	private overlayFetchToken = 0;
	private entriesFetchToken = 0;

	toggleEdit(): void {
		this.isEditing = !this.isEditing;
	}

	/** Base doc (server-rendered) for a scope. */
	private baseDoc(scope: CmsScopeRef): Tree {
		const cms = page.data?.cms as CmsPayload | undefined;
		return (cms?.docs?.[scope.scopeId] ?? {}) as Tree;
	}

	/** Merged read tree: base ∪ overlay (∪ draft when editing). */
	private mergedTree(scope: CmsScopeRef): Tree {
		const key = composeKey(scope);
		const base = this.baseDoc(scope);
		const ov = this.overlay[key];
		const draft = this.isEditing ? this.drafts[key]?.tree : undefined;
		return mergeTree(base, ov, draft);
	}

	/** Read the merged value at `path`. Returns `undefined` if missing. */
	getValue(scope: CmsScopeRef, path: string): unknown {
		return get(this.mergedTree(scope), path);
	}

	/** Whether the editor's draft tree contains a value at `path`. */
	hasDraft(scope: CmsScopeRef, path: string): boolean {
		const bucket = this.drafts[composeKey(scope)];
		return bucket ? has(bucket.tree, path) : false;
	}

	/** Whether the client overlay (published+release) contains a value at `path`. */
	hasOverlay(scope: CmsScopeRef, path: string): boolean {
		const ov = this.overlay[composeKey(scope)];
		return ov ? has(ov, path) : false;
	}

	/** Write a value at `path` into the draft tree. Creates the bucket if needed. */
	setValue(scope: CmsScopeRef, path: string, value: unknown): void {
		const key = composeKey(scope);
		const bucket = this.drafts[key] ?? (this.drafts[key] = { scope, tree: {} });
		set(bucket.tree, path, value);
	}

	clearOverlay(): void {
		this.overlay = {};
		this.entriesOverlay = {};
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
	 * `opts.reset` replaces the overlay map wholesale (mount with release,
	 * post-publish, post-discard). Otherwise we merge — keeps unchanged-layout
	 * overlays applied during navigation while new-page scopes load.
	 */
	async loadAndApplyOverlay(
		endpoint: string,
		scopes: CmsScopeEntry[],
		previewKey: string | null,
		opts: { reset?: boolean; versionKey?: string | null } = {}
	): Promise<void> {
		const token = ++this.overlayFetchToken;
		const versionKey = opts.versionKey ?? null;

		const fetchOne = async (scope: CmsScopeEntry) => {
			const qs = new URLSearchParams({
				kind: scope.kind,
				routeId: scope.routeId,
				params: JSON.stringify(scope.params)
			});
			if (versionKey) qs.set('version', versionKey);
			else if (previewKey) qs.set('preview', previewKey);
			const res = await fetch(`${endpoint}/docs?${qs}`, { credentials: 'include' });
			if (!res.ok) return null;
			const data = (await res.json()) as { contents: Tree };
			return { scope, contents: data.contents };
		};

		const results = await Promise.all(scopes.map(fetchOne));
		if (token !== this.overlayFetchToken) return;

		const next: Record<string, Tree> = {};
		for (const r of results) {
			if (!r) continue;
			const key = composeKey({
				scopeId: r.scope.scopeId,
				routeId: r.scope.routeId,
				params: r.scope.params
			});
			next[key] = r.contents ?? {};
		}

		if (opts.reset) {
			this.overlay = next;
		} else {
			this.overlay = { ...this.overlay, ...next };
		}
	}

	/**
	 * Refresh the per-routeId entries overlay used by `<CmsEntries>`. One fetch
	 * to `${endpoint}/pages?preview=…` covers all `routeIds`; we filter the
	 * response per route. With `previewKey` set, draft and pending-delete
	 * entries are kept; with `previewKey === null`, they're filtered out — used
	 * post-publish to mask stale `page.data.cms.entries` on static-export sites.
	 */
	async loadAndApplyEntriesOverlay(
		endpoint: string,
		routeIds: string[],
		previewKey: string | null,
		opts: { reset?: boolean; versionKey?: string | null } = {}
	): Promise<void> {
		const token = ++this.entriesFetchToken;
		if (routeIds.length === 0) {
			if (opts.reset) this.entriesOverlay = {};
			return;
		}

		const versionKey = opts.versionKey ?? null;
		const querySuffix = versionKey
			? `?version=${encodeURIComponent(versionKey)}`
			: previewKey
				? `?preview=${encodeURIComponent(previewKey)}`
				: '';
		let res: Response;
		try {
			res = await fetch(`${endpoint}/pages${querySuffix}`, { credentials: 'include' });
		} catch {
			return;
		}
		if (token !== this.entriesFetchToken) return;
		if (!res.ok) return;

		const body = (await res.json()) as {
			routes: Array<{
				routeId: string;
				entries: Array<{
					params: Record<string, string>;
					isDraft?: boolean;
					isDeletePending?: boolean;
					metadata?: Record<string, unknown>;
				}>;
			}>;
		};

		const next: Record<string, CmsEntry[]> = {};
		const wanted = new Set(routeIds);
		for (const r of body.routes) {
			if (!wanted.has(r.routeId)) continue;
			const filtered =
				versionKey || previewKey
					? r.entries
					: r.entries.filter((e) => !e.isDraft && !e.isDeletePending);
			next[r.routeId] = filtered.map((e) => ({
				params: e.params,
				metadata: e.metadata ?? {}
			}));
		}
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
		return false;
	}

	get workingCopyCounts(): { pages: number; layouts: number; total: number } {
		let pages = 0;
		let layouts = 0;
		for (const item of this.openRelease?.items ?? []) {
			if (item.kind === 'layout') layouts += 1;
			else pages += 1;
		}
		return { pages, layouts, total: pages + layouts };
	}

	clearDrafts(): void {
		this.drafts = {};
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
		return resolveMediaItem(item);
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
		return { ...data, items: data.items.map(resolveMediaItem) };
	}

	async deleteMedia(endpoint: string, id: string): Promise<void> {
		const res = await fetch(`${endpoint}/media/${id}`, {
			method: 'DELETE',
			credentials: 'include'
		});
		if (!res.ok) throw new Error(`Delete failed (${res.status})`);
	}

	/**
	 * Flush dirty drafts to the server's open release as one item per scope,
	 * each carrying a partial tree. The server deep-merges each tree into its
	 * matching item in the working copy without publishing.
	 */
	async save(endpoint: string): Promise<{ ok: boolean; release?: OpenRelease }> {
		type SaveInput =
			| { kind: 'page'; routeId: string; params: Record<string, string>; tree: Tree }
			| { kind: 'layout'; routeId: string; tree: Tree };

		const items: SaveInput[] = [];
		for (const bucket of Object.values(this.drafts)) {
			if (!treeHasAnyLeaf(bucket.tree)) continue;
			const kind = scopeKindFromId(bucket.scope.scopeId);
			if (kind === 'page') {
				items.push({
					kind: 'page',
					routeId: bucket.scope.routeId,
					params: bucket.scope.params,
					tree: bucket.tree
				});
			} else {
				items.push({ kind: 'layout', routeId: bucket.scope.routeId, tree: bucket.tree });
			}
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
			const overlayKey = composeKey({
				scopeId: scopeEntry.scopeId,
				routeId: scopeEntry.routeId,
				params: scopeEntry.params
			});
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
}

export const cms = new Cms();
