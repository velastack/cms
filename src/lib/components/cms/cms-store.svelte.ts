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
 * Once edits are saved into the open release, they show up in subsequent
 * SSR loads via the `?preview=<release-preview-key>` URL parameter, so
 * there's no client-side overlay machinery here.
 */

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
	  }
	| { kind: 'layout'; routeId: string; fields: Record<string, unknown> }
	| { kind: 'page-delete'; routeId: string; params: Record<string, string> };

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

	toggleEdit(): void {
		this.isEditing = !this.isEditing;
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
		type EditableItem = Exclude<ReleaseItem, { kind: 'page-delete' }>;
		const itemsByKey = new Map<string, EditableItem>();

		const itemFor = (scope: CmsScopeRef): EditableItem => {
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
