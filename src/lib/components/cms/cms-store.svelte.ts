/**
 * Reactive edit-mode store for CMS components.
 *
 * `drafts` and `metadataDrafts` hold uncommitted, in-progress field edits
 * the editor is making locally. Each entry is tagged with the scope it
 * belongs to (`scopeId`, `routeId`, `params`) so navigation between sibling
 * param values (e.g. `slug=suite-1` → `slug=suite-2`) keeps each set of
 * edits separate. Display components prefer drafts over published values
 * when `isEditing` is on.
 *
 * `save(endpoint)` flushes both buckets to `${endpoint}/release/items`,
 * which adds them to the editor's open release on the server. The release
 * is published atomically by the separate `/release/publish` action — saving
 * is cheap and reversible, publishing is the deliberate "go live" step.
 *
 * `overlay` and `metadataOverlay` hold merged published+release content
 * fetched client-side from `${endpoint}/docs`. Display components prefer
 * overlay over `page.data.cms.docs`. This is how the authed editor sees
 * working-copy state on static-export sites where SvelteKit's server load
 * cannot be re-run; the SSR `?preview=KEY` path remains as a fallback for
 * shared preview links rendered on hosts that do have a Node backend.
 */
import type { CmsScopeEntry } from './scope.js';

export type CmsScopeRef = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
};

type DraftBucket = {
	scope: CmsScopeRef;
	fields: Record<string, unknown>;
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
			fields: Record<string, unknown>;
			addedAt: string;
	  }
	| { kind: 'layout'; routeId: string; fields: Record<string, unknown>; addedAt: string }
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

const scopeKindFromId = (scopeId: string): 'page' | 'layout' =>
	scopeId.startsWith('layout:') ? 'layout' : 'page';

class CmsStore {
	isEditing = $state(false);
	drafts = $state<Record<string, DraftBucket>>({});
	metadataDrafts = $state<Record<string, DraftBucket>>({});
	openRelease = $state<OpenRelease | null>(null);
	overlay = $state<Record<string, Record<string, unknown>>>({});
	metadataOverlay = $state<Record<string, Record<string, unknown>>>({});
	private overlayFetchToken = 0;

	toggleEdit(): void {
		this.isEditing = !this.isEditing;
	}

	hasOverlay(scope: CmsScopeRef, name: string): boolean {
		const bucket = this.overlay[composeKey(scope)];
		return bucket !== undefined && name in bucket;
	}

	getOverlayValue(scope: CmsScopeRef, name: string): unknown {
		return this.overlay[composeKey(scope)]?.[name];
	}

	hasMetadataOverlay(scope: CmsScopeRef, name: string): boolean {
		const bucket = this.metadataOverlay[composeKey(scope)];
		return bucket !== undefined && name in bucket;
	}

	getMetadataOverlayValue(scope: CmsScopeRef, name: string): unknown {
		return this.metadataOverlay[composeKey(scope)]?.[name];
	}

	clearOverlay(): void {
		this.overlay = {};
		this.metadataOverlay = {};
	}

	/**
	 * Fetch merged published+release content for each scope on the current
	 * route via `${endpoint}/docs` and apply as a client-side overlay.
	 *
	 * `previewKey` selects the user's open release on the server; pass `null`
	 * to fetch published-only content (used post-publish to mask the now-stale
	 * `page.data.cms.docs` on static-export sites).
	 *
	 * `opts.reset` replaces the overlay maps wholesale (mount with release,
	 * post-publish, post-discard). Otherwise we merge — keeps unchanged-layout
	 * overlays applied during navigation while new-page scopes load.
	 */
	async loadAndApplyOverlay(
		endpoint: string,
		scopes: CmsScopeEntry[],
		previewKey: string | null,
		opts: { reset?: boolean } = {}
	): Promise<void> {
		const token = ++this.overlayFetchToken;

		const fetchOne = async (scope: CmsScopeEntry) => {
			const qs = new URLSearchParams({
				kind: scope.kind,
				routeId: scope.routeId,
				params: JSON.stringify(scope.params)
			});
			if (previewKey) qs.set('preview', previewKey);
			const res = await fetch(`${endpoint}/docs?${qs}`);
			if (!res.ok) return null;
			const data = (await res.json()) as { contents: Record<string, unknown> };
			return { scope, contents: data.contents };
		};

		const results = await Promise.all(scopes.map(fetchOne));
		if (token !== this.overlayFetchToken) return;

		const nextOverlay: Record<string, Record<string, unknown>> = {};
		const nextMeta: Record<string, Record<string, unknown>> = {};
		for (const r of results) {
			if (!r) continue;
			const key = composeKey({
				scopeId: r.scope.scopeId,
				routeId: r.scope.routeId,
				params: r.scope.params
			});
			const { _metadata, ...fields } = r.contents as { _metadata?: unknown } & Record<
				string,
				unknown
			>;
			nextOverlay[key] = fields;
			if (r.scope.kind === 'page' && _metadata && typeof _metadata === 'object') {
				nextMeta[key] = _metadata as Record<string, unknown>;
			}
		}

		if (opts.reset) {
			this.overlay = nextOverlay;
			this.metadataOverlay = nextMeta;
		} else {
			this.overlay = { ...this.overlay, ...nextOverlay };
			this.metadataOverlay = { ...this.metadataOverlay, ...nextMeta };
		}
	}

	setValue(scope: CmsScopeRef, name: string, value: unknown): void {
		const key = composeKey(scope);
		const bucket = this.drafts[key] ?? (this.drafts[key] = { scope, fields: {} });
		bucket.fields[name] = value;
	}

	getValue(scope: CmsScopeRef, name: string): unknown {
		return this.drafts[composeKey(scope)]?.fields[name];
	}

	hasDraft(scope: CmsScopeRef, name: string): boolean {
		const bucket = this.drafts[composeKey(scope)];
		return bucket !== undefined && name in bucket.fields;
	}

	setMetadataValue(scope: CmsScopeRef, name: string, value: unknown): void {
		const key = composeKey(scope);
		const bucket = this.metadataDrafts[key] ?? (this.metadataDrafts[key] = { scope, fields: {} });
		bucket.fields[name] = value;
	}

	getMetadataValue(scope: CmsScopeRef, name: string): unknown {
		return this.metadataDrafts[composeKey(scope)]?.fields[name];
	}

	hasMetadataDraft(scope: CmsScopeRef, name: string): boolean {
		const bucket = this.metadataDrafts[composeKey(scope)];
		return bucket !== undefined && name in bucket.fields;
	}

	get isDirty(): boolean {
		for (const bucket of Object.values(this.drafts)) {
			if (Object.keys(bucket.fields).length > 0) return true;
		}
		for (const bucket of Object.values(this.metadataDrafts)) {
			if (Object.keys(bucket.fields).length > 0) return true;
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
		this.metadataDrafts = {};
	}

	setOpenRelease(release: OpenRelease | null): void {
		this.openRelease = release;
	}

	async fetchOpenRelease(endpoint: string): Promise<void> {
		const res = await fetch(`${endpoint}/release`);
		if (!res.ok) {
			this.openRelease = null;
			return;
		}
		const data = (await res.json()) as { release: OpenRelease | null };
		this.openRelease = data.release;
	}

	/**
	 * Flush dirty drafts and metadata to the server's open release. Layout
	 * and page edits are sent in one batch — the server merges them into the
	 * editor's working copy without publishing. Metadata edits ride along on
	 * the matching scope's item under a `_metadata` key.
	 */
	async save(endpoint: string): Promise<{ ok: boolean; release?: OpenRelease }> {
		type SaveInput =
			| { kind: 'page'; routeId: string; params: Record<string, string>; fields: Record<string, unknown> }
			| { kind: 'layout'; routeId: string; fields: Record<string, unknown> };
		const itemsByKey = new Map<string, SaveInput>();

		const itemFor = (scope: CmsScopeRef): SaveInput => {
			const key = composeKey(scope);
			let item = itemsByKey.get(key);
			if (!item) {
				const kind = scopeKindFromId(scope.scopeId);
				item =
					kind === 'page'
						? { kind: 'page', routeId: scope.routeId, params: scope.params, fields: {} }
						: { kind: 'layout', routeId: scope.routeId, fields: {} };
				itemsByKey.set(key, item);
			}
			return item;
		};

		for (const bucket of Object.values(this.drafts)) {
			if (Object.keys(bucket.fields).length === 0) continue;
			Object.assign(itemFor(bucket.scope).fields, bucket.fields);
		}
		for (const bucket of Object.values(this.metadataDrafts)) {
			if (Object.keys(bucket.fields).length === 0) continue;
			const item = itemFor(bucket.scope);
			const existingMeta = (item.fields._metadata as Record<string, unknown> | undefined) ?? {};
			item.fields._metadata = { ...existingMeta, ...bucket.fields };
		}

		const items = [...itemsByKey.values()];
		if (items.length === 0) return { ok: true, release: this.openRelease ?? undefined };

		const res = await fetch(`${endpoint}/release/items`, {
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
