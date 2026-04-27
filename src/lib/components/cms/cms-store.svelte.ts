/**
 * Reactive edit-mode store for CMS components.
 *
 * `drafts` and `metadataDrafts` hold in-progress field edits. Each entry is
 * tagged with the scope it belongs to (`scopeId`, `routeId`, `params`) so
 * navigation between sibling param values (e.g. `slug=suite-1` →
 * `slug=suite-2`) keeps each set of edits separate. Display components prefer
 * drafts over published values when `isEditing` is on. `save(endpoint, page)`
 * POSTs both buckets to `${endpoint}/docs` and clears them only when the
 * request succeeds.
 */
import type { CmsPagePointer } from './scope.js';

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

type SavedPageVersion = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
	version: number;
	preview_key: string;
};

type Overlay = {
	key: string;
	scope: CmsScopeRef;
	fields: Record<string, unknown>;
	pointer: CmsPagePointer;
};

class CmsStore {
	isEditing = $state(false);
	drafts = $state<Record<string, DraftBucket>>({});
	metadataDrafts = $state<Record<string, DraftBucket>>({});
	overlay = $state<Overlay | null>(null);

	setOverlay(scope: CmsScopeRef, fields: Record<string, unknown>, pointer: CmsPagePointer): void {
		this.overlay = { key: composeKey(scope), scope, fields, pointer };
	}

	clearOverlay(): void {
		this.overlay = null;
	}

	hasOverlay(scope: CmsScopeRef, name: string): boolean {
		const o = this.overlay;
		return !!o && o.key === composeKey(scope) && name in o.fields;
	}

	getOverlayValue(scope: CmsScopeRef, name: string): unknown {
		const o = this.overlay;
		return o && o.key === composeKey(scope) ? o.fields[name] : undefined;
	}

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
		const bucket =
			this.metadataDrafts[key] ?? (this.metadataDrafts[key] = { scope, fields: {} });
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

	clearDrafts(): void {
		this.drafts = {};
		this.metadataDrafts = {};
	}

	async save(
		endpoint: string,
		page: CmsPagePointer | null
	): Promise<{
		ok: boolean;
		pageVersion?: SavedPageVersion;
	}> {
		const toEntries = (buckets: Record<string, DraftBucket>) =>
			Object.values(buckets)
				.filter((b) => Object.keys(b.fields).length > 0)
				.map((b) => ({
					scopeId: b.scope.scopeId,
					routeId: b.scope.routeId,
					params: b.scope.params,
					fields: b.fields
				}));

		const body = {
			drafts: toEntries(this.drafts),
			metadata: toEntries(this.metadataDrafts),
			page: page
				? {
						scopeId: page.scopeId,
						routeId: page.routeId,
						params: page.params,
						baseVersion: page.version
					}
				: null
		};
		const res = await fetch(`${endpoint}/docs`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) return { ok: false };
		const data = (await res.json()) as {
			ok?: boolean;
			pageVersion?: SavedPageVersion;
		};
		this.clearDrafts();
		return { ok: true, pageVersion: data.pageVersion };
	}
}

export const cmsStore = new CmsStore();
