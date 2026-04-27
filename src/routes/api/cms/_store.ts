/**
 * Shared in-memory mock store for the test harness.
 *
 * `layoutDocs` holds flat layout documents keyed by `routeId` (header,
 * footer, marketing chrome). `pageDocs` holds the currently-published page
 * documents keyed by `routeId`, each entry tagged with its `params` (e.g.
 * `{ slug: 'suite-1' }`) and the `published` field map.
 *
 * `openReleases` (per `userId`) and `releaseHistory` hold the release model:
 * each editor accumulates pending edits in their own open release; publish
 * applies the whole release atomically to `pageDocs`/`layoutDocs` and appends
 * a `PublishedRelease` to history (with each item's prior fields, so revert
 * is symmetric).
 *
 * All four stores are the same object references the `mockAdapter` captures
 * from `+layout.server.ts`. Mutate in place — never reassign — or the
 * adapter's captured reference will silently desync.
 *
 * Note: dev-mode HMR re-evaluates this module, which resets the store —
 * including any pending edits and release history. Acceptable for a mock;
 * would not be acceptable for real persistence.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
	findPageEntry,
	type PageEntry,
	type ReleaseItemSnapshot,
	type ReleaseSnapshot
} from '$lib/server/mock-adapter.js';

export const generatePreviewKey = (): string => randomBytes(8).toString('hex');

const entry = (params: Record<string, string>, published: Record<string, unknown>): PageEntry => ({
	params,
	published
});

export const layoutDocs: Record<string, Record<string, unknown>> = {
	'/': {
		'footer.links': [
			{ href: '/', label: 'Home' },
			{ href: '/about', label: 'About' },
			{ href: '/dashboard', label: 'Dashboard' }
		]
	},
	'/(marketing)': {
		'header.title': 'VelaStack CMS',
		'announcement.text': 'Spring rates are live — book by April 30.'
	},
	'/(app)': {
		'header.title': 'VelaStack CMS — Admin'
	}
};

export const pageDocs: Record<string, PageEntry[]> = {
	'/': [
		entry(
			{},
			{
				'welcome.title': 'Velastack CMS test harness',
				'welcome.body':
					'<p>Pick a section: marketing pages live under <a href="/about">/about</a> and <a href="/rooms/suite-1">/rooms/[slug]</a>; the app shell lives under <a href="/dashboard">/dashboard</a>.</p>',
				_metadata: {
					title: 'Home',
					description: 'Velastack CMS test harness — start here.'
				}
			}
		)
	],
	'/(marketing)/about': [
		entry(
			{},
			{
				'hero.title': 'About VelaStack CMS',
				body: '<p>A zero-config CMS for SvelteKit. This page is rendered through the marketing layout, so its CMS fields live under the <code>page:/(marketing)/about</code> scope.</p>',
				_metadata: {
					title: 'About VelaStack CMS',
					description: 'A zero-config CMS for SvelteKit.'
				}
			}
		)
	],
	'/(marketing)/rooms/[slug]': [
		entry(
			{ slug: 'suite-1' },
			{
				'hero.title': 'Suite 1 — Cliffside',
				'hero.image': 'https://placehold.co/960x420?text=Suite+1',
				'gallery.items': [
					{ src: 'https://placehold.co/400x300?text=View+1', caption: 'Morning light' },
					{ src: 'https://placehold.co/400x300?text=View+2', caption: 'Sunset deck' }
				],
				_metadata: {
					title: 'Suite 1 — Cliffside',
					description: 'Cliffside suite with two ocean-view scenes.'
				}
			}
		),
		entry(
			{ slug: 'suite-2' },
			{
				'hero.title': 'Suite 2 — Garden',
				'hero.image': 'https://placehold.co/960x420?text=Suite+2',
				'gallery.items': [
					{ src: 'https://placehold.co/400x300?text=Garden+1', caption: 'Courtyard' }
				],
				_metadata: {
					title: 'Suite 2 — Garden',
					description: 'Garden suite overlooking the central courtyard.'
				}
			}
		)
	],
	'/(app)/dashboard': [
		entry(
			{},
			{
				'welcome.title': 'Welcome back',
				body: '<p>Operator dashboard. Same <code>Header.svelte</code>, different scope, different content.</p>',
				_metadata: {
					title: 'Dashboard',
					description: 'Operator dashboard.',
					robots: 'noindex'
				}
			}
		)
	]
};

/**
 * One pending change in an open release. `page` and `layout` items hold
 * field edits (a flat map; page items may include a reserved `_metadata`
 * key) and shallow-merge into existing items for the same scope. The
 * `page-delete` variant stages a published-page removal — it carries no
 * fields and only takes effect on publish.
 */
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

export type PublishedReleaseItem = ReleaseItem & {
	/** The fields' values immediately before this release was applied; null
	 * for page items where no published entry existed yet. Used by revert. */
	priorFields: Record<string, unknown> | null;
};

export type PublishedRelease = {
	id: string;
	name?: string;
	publishedBy: string;
	publishedAt: string;
	items: PublishedReleaseItem[];
	revertedAt?: string;
};

export const openReleases: Record<string, OpenRelease> = {};
export const releaseHistory: PublishedRelease[] = [];

const paramsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
	const aKeys = Object.keys(a);
	if (aKeys.length !== Object.keys(b).length) return false;
	for (const k of aKeys) if (a[k] !== b[k]) return false;
	return true;
};

const findItem = <K extends 'page' | 'layout'>(
	items: ReleaseItem[],
	target: { kind: K; routeId: string; params?: Record<string, string> }
): Extract<ReleaseItem, { kind: K }> | undefined => {
	for (const item of items) {
		if (item.kind !== target.kind || item.routeId !== target.routeId) continue;
		if (target.kind === 'page') {
			if (item.kind === 'page' && paramsEqual(item.params, target.params ?? {})) {
				return item as Extract<ReleaseItem, { kind: K }>;
			}
		} else {
			return item as Extract<ReleaseItem, { kind: K }>;
		}
	}
	return undefined;
};

const ensureOpenRelease = (userId: string): OpenRelease => {
	let r = openReleases[userId];
	if (!r) {
		r = {
			userId,
			createdAt: new Date().toISOString(),
			preview_key: generatePreviewKey(),
			items: []
		};
		openReleases[userId] = r;
	}
	return r;
};

export const getOpenRelease = (userId: string): OpenRelease | null => openReleases[userId] ?? null;

/**
 * Look up an open release by its preview key (any user). Used by the adapter
 * to overlay pending edits when a request carries `?preview=…`.
 */
export const lookupReleaseByPreviewKey = (key: string): ReleaseSnapshot | null => {
	for (const r of Object.values(openReleases)) {
		if (r.preview_key !== key) continue;
		const items: ReleaseItemSnapshot[] = r.items.map((i) => {
			if (i.kind === 'page') {
				return { kind: 'page', routeId: i.routeId, params: i.params, fields: i.fields };
			}
			if (i.kind === 'layout') {
				return { kind: 'layout', routeId: i.routeId, fields: i.fields };
			}
			return { kind: 'page-delete', routeId: i.routeId, params: i.params };
		});
		return { id: r.userId, items };
	}
	return null;
};

/**
 * Look up an open release directly. Used by the docs endpoint to overlay a
 * single scope without a full release snapshot trip.
 */
export const findOpenReleaseByPreviewKey = (key: string): OpenRelease | null => {
	for (const r of Object.values(openReleases)) {
		if (r.preview_key === key) return r;
	}
	return null;
};

export type AddReleaseItemInput =
	| {
			kind: 'page';
			routeId: string;
			params: Record<string, string>;
			fields: Record<string, unknown>;
	  }
	| { kind: 'layout'; routeId: string; fields: Record<string, unknown> };

/**
 * Add or merge items into the user's open release. New scopes get a new
 * item; existing scopes get their fields shallow-merged (latest value wins),
 * so saving the same field twice keeps the second value. `_metadata` keys
 * inside page items also shallow-merge so partial metadata edits don't drop
 * other keys.
 */
export const addReleaseItems = (userId: string, inputs: AddReleaseItemInput[]): OpenRelease => {
	const release = ensureOpenRelease(userId);
	for (const input of inputs) {
		if (Object.keys(input.fields).length === 0) continue;
		const existing = findItem(release.items, input);
		if (existing) {
			mergeFields(existing.fields, input.fields);
		} else if (input.kind === 'page') {
			release.items.push({
				kind: 'page',
				routeId: input.routeId,
				params: { ...input.params },
				fields: { ...input.fields }
			});
		} else {
			release.items.push({
				kind: 'layout',
				routeId: input.routeId,
				fields: { ...input.fields }
			});
		}
	}
	return release;
};

const mergeFields = (target: Record<string, unknown>, incoming: Record<string, unknown>): void => {
	for (const [k, v] of Object.entries(incoming)) {
		if (k === '_metadata' && v && typeof v === 'object' && !Array.isArray(v)) {
			const existing = (target._metadata as Record<string, unknown>) ?? {};
			target._metadata = { ...existing, ...(v as Record<string, unknown>) };
		} else {
			target[k] = v;
		}
	}
};

export type DiscardItemTarget =
	| { kind: 'page'; routeId: string; params: Record<string, string> }
	| { kind: 'layout'; routeId: string }
	| { kind: 'page-delete'; routeId: string; params: Record<string, string> };

/** Drop one item from the user's open release. */
export const discardReleaseItem = (userId: string, target: DiscardItemTarget): boolean => {
	const release = openReleases[userId];
	if (!release) return false;
	const before = release.items.length;
	release.items = release.items.filter((item) => {
		if (item.kind !== target.kind || item.routeId !== target.routeId) return true;
		if (target.kind === 'layout') return false;
		if (item.kind === 'layout') return true;
		return !paramsEqual(item.params, target.params);
	});
	return release.items.length !== before;
};

/** Drop the entire open release for a user. */
export const discardOpenRelease = (userId: string): boolean => {
	if (!openReleases[userId]) return false;
	delete openReleases[userId];
	return true;
};

/** Rotate the preview key on the user's open release. Returns the new key,
 * or null if there's no open release. */
export const regeneratePreviewKey = (userId: string): string | null => {
	const release = openReleases[userId];
	if (!release) return null;
	release.preview_key = generatePreviewKey();
	return release.preview_key;
};

/**
 * Apply every item in the user's open release atomically to `pageDocs` /
 * `layoutDocs`, capture each item's prior fields for revert, append to
 * history, and clear the open release. Returns the new `PublishedRelease`,
 * or null if the user has nothing to publish.
 */
export const publishRelease = (userId: string, name?: string): PublishedRelease | null => {
	const release = openReleases[userId];
	if (!release || release.items.length === 0) return null;

	const publishedItems: PublishedReleaseItem[] = [];

	for (const item of release.items) {
		if (item.kind === 'layout') {
			const target = (layoutDocs[item.routeId] ??= {});
			const priorFields = capturePriorFields(target, item.fields);
			mergeFields(target, item.fields);
			publishedItems.push({ ...item, fields: { ...item.fields }, priorFields });
		} else if (item.kind === 'page') {
			const entries = (pageDocs[item.routeId] ??= []);
			let pageEntry = findPageEntry(entries, item.params);
			let priorFields: Record<string, unknown> | null;
			if (!pageEntry) {
				pageEntry = { params: { ...item.params }, published: {} };
				entries.push(pageEntry);
				priorFields = null;
			} else {
				priorFields = capturePriorFields(pageEntry.published, item.fields);
			}
			mergeFields(pageEntry.published, item.fields);
			publishedItems.push({
				kind: 'page',
				routeId: item.routeId,
				params: { ...item.params },
				fields: { ...item.fields },
				priorFields
			});
		} else {
			// page-delete: remove the entry from pageDocs and capture its
			// prior published fields so revert can resurrect it.
			const entries = pageDocs[item.routeId];
			const idx = entries ? entries.findIndex((e) => paramsEqual(e.params, item.params)) : -1;
			if (idx < 0) {
				// Nothing to delete (already gone). Skip the history entry.
				continue;
			}
			const removed = entries![idx];
			entries!.splice(idx, 1);
			publishedItems.push({
				kind: 'page-delete',
				routeId: item.routeId,
				params: { ...item.params },
				priorFields: structuredClone(removed.published)
			});
		}
	}

	const published: PublishedRelease = {
		id: randomUUID(),
		name: name ?? release.name,
		publishedBy: userId,
		publishedAt: new Date().toISOString(),
		items: publishedItems
	};
	releaseHistory.push(published);
	delete openReleases[userId];
	return published;
};

/**
 * Capture the values of every key in `incoming` as they appear in `target`
 * right now. `_metadata` is captured shallowly so revert can restore each
 * touched sub-key without disturbing untouched ones.
 */
const capturePriorFields = (
	target: Record<string, unknown>,
	incoming: Record<string, unknown>
): Record<string, unknown> => {
	const prior: Record<string, unknown> = {};
	for (const k of Object.keys(incoming)) {
		if (k === '_metadata') {
			const existing = (target._metadata as Record<string, unknown>) ?? {};
			const incomingMeta = incoming._metadata as Record<string, unknown> | undefined;
			if (incomingMeta && typeof incomingMeta === 'object' && !Array.isArray(incomingMeta)) {
				const captured: Record<string, unknown> = {};
				for (const mk of Object.keys(incomingMeta)) {
					captured[mk] = existing[mk];
				}
				prior._metadata = captured;
			} else {
				prior._metadata = structuredClone(existing);
			}
		} else {
			prior[k] = structuredClone(target[k]);
		}
	}
	return prior;
};

export const getReleaseHistory = (): PublishedRelease[] => releaseHistory;

/**
 * Build a brand-new release containing the inverse of a published release's
 * items, then publish it. Restores each touched field to its captured prior
 * value (last-writer-wins if subsequent releases edited the same fields —
 * acceptable for v1).
 */
export const revertRelease = (releaseId: string, userId: string): PublishedRelease | null => {
	const source = releaseHistory.find((r) => r.id === releaseId);
	if (!source) return null;

	const inverseItems: PublishedReleaseItem[] = [];
	for (const item of source.items) {
		if (item.kind === 'layout') {
			const restoreFields = item.priorFields ?? {};
			const target = (layoutDocs[item.routeId] ??= {});
			const priorFields = capturePriorFields(target, restoreFields);
			restoreOnto(target, restoreFields);
			inverseItems.push({
				kind: 'layout',
				routeId: item.routeId,
				fields: structuredClone(restoreFields),
				priorFields
			});
		} else if (item.kind === 'page-delete') {
			// The original publish removed a page entry; revert re-inserts it
			// from the captured priorFields. Inverse is a `page` create — its
			// priorFields are null because nothing existed at the moment of
			// revert (the entry had been deleted).
			const entries = (pageDocs[item.routeId] ??= []);
			if (findPageEntry(entries, item.params)) continue;
			const restored = item.priorFields ?? {};
			entries.push({ params: { ...item.params }, published: structuredClone(restored) });
			inverseItems.push({
				kind: 'page',
				routeId: item.routeId,
				params: { ...item.params },
				fields: structuredClone(restored),
				priorFields: null
			});
		} else if (item.priorFields == null) {
			// The original publish created the page entry; revert deletes it.
			const entries = pageDocs[item.routeId];
			if (!entries) continue;
			const idx = entries.findIndex((e) => paramsEqual(e.params, item.params));
			if (idx < 0) continue;
			const removed = entries[idx];
			entries.splice(idx, 1);
			inverseItems.push({
				kind: 'page-delete',
				routeId: item.routeId,
				params: { ...item.params },
				priorFields: structuredClone(removed.published)
			});
		} else {
			const restoreFields = item.priorFields;
			const entries = (pageDocs[item.routeId] ??= []);
			const pageEntry = findPageEntry(entries, item.params);
			if (!pageEntry) continue;
			const priorFields = capturePriorFields(pageEntry.published, restoreFields);
			restoreOnto(pageEntry.published, restoreFields);
			inverseItems.push({
				kind: 'page',
				routeId: item.routeId,
				params: { ...item.params },
				fields: structuredClone(restoreFields),
				priorFields
			});
		}
	}

	source.revertedAt = new Date().toISOString();

	const published: PublishedRelease = {
		id: randomUUID(),
		name: source.name ? `Revert "${source.name}"` : `Revert ${source.id.slice(0, 8)}`,
		publishedBy: userId,
		publishedAt: new Date().toISOString(),
		items: inverseItems
	};
	releaseHistory.push(published);
	return published;
};

/**
 * Apply restoration values to a target object. Unlike merge, deletes keys
 * whose restored value is `undefined` (the field didn't exist before).
 * `_metadata` sub-keys follow the same rule.
 */
const restoreOnto = (target: Record<string, unknown>, restore: Record<string, unknown>): void => {
	for (const [k, v] of Object.entries(restore)) {
		if (k === '_metadata' && v && typeof v === 'object' && !Array.isArray(v)) {
			const existing = (target._metadata as Record<string, unknown>) ?? {};
			const next: Record<string, unknown> = { ...existing };
			for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
				if (mv === undefined) delete next[mk];
				else next[mk] = mv;
			}
			target._metadata = next;
		} else if (v === undefined) {
			delete target[k];
		} else {
			target[k] = v;
		}
	}
};

/**
 * List the bound values seen in `pageDocs` for one `[param]` of a given route.
 * Used for SvelteKit page-entry generation: given `routeId` like
 * `/(marketing)/rooms/[slug]` and `param: 'slug'`, returns every distinct
 * slug value for which a page document exists.
 */
export const listPageParamValues = (routeId: string, param: string): string[] => {
	const entries = pageDocs[routeId];
	if (!entries) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const e of entries) {
		const v = e.params[param];
		if (typeof v !== 'string' || seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
};

export type CreatePageResult = { ok: true } | { ok: false; reason: 'exists' };

/**
 * Stage a brand-new page at `routeId` + `params` as a release item in the
 * user's open release. The page only enters `pageDocs` when the release is
 * published — until then it's invisible to public traffic and visible to the
 * editor (and anyone with the preview key) via the overlay path. Refuses if
 * a published entry with the exact same params already exists, or if any
 * other open release already has a pending item for the same scope.
 */
export const createPage = (
	userId: string,
	routeId: string,
	params: Record<string, string>,
	metadata: Record<string, unknown> = {}
): CreatePageResult => {
	const entries = pageDocs[routeId];
	if (findPageEntry(entries, params)) return { ok: false, reason: 'exists' };
	for (const r of Object.values(openReleases)) {
		for (const item of r.items) {
			if (item.kind === 'page' && item.routeId === routeId && paramsEqual(item.params, params)) {
				return { ok: false, reason: 'exists' };
			}
		}
	}
	addReleaseItems(userId, [{ kind: 'page', routeId, params, fields: { _metadata: metadata } }]);
	return { ok: true };
};

export type StagePageDeleteResult =
	| { ok: true; alreadyStaged: boolean }
	| { ok: false; reason: 'not-published' | 'has-draft' };

/**
 * Stage a `page-delete` item in the user's open release. The published page
 * stays live until the release is published; in the meantime the editor (and
 * preview-key holders) see the page as removed via the adapter overlay.
 * Refuses if the page isn't actually published, or if the user has a draft
 * `page` item for the same scope (the caller should discard the draft via
 * `discardReleaseItem` instead — drafts have nothing to delete).
 */
export const stagePageDelete = (
	userId: string,
	routeId: string,
	params: Record<string, string>
): StagePageDeleteResult => {
	if (!findPageEntry(pageDocs[routeId], params)) {
		return { ok: false, reason: 'not-published' };
	}
	const release = openReleases[userId];
	if (release) {
		for (const item of release.items) {
			if (item.kind !== 'page' && item.kind !== 'page-delete') continue;
			if (item.routeId !== routeId) continue;
			if (!paramsEqual(item.params, params)) continue;
			if (item.kind === 'page') return { ok: false, reason: 'has-draft' };
			return { ok: true, alreadyStaged: true };
		}
	}
	const r = ensureOpenRelease(userId);
	r.items.push({ kind: 'page-delete', routeId, params: { ...params } });
	return { ok: true, alreadyStaged: false };
};

export type PageMapEntry = {
	params: Record<string, string>;
	isDraft: boolean;
	isDeletePending: boolean;
};

export type PageMapRoute = {
	routeId: string;
	entries: PageMapEntry[];
};

const paramsKey = (params: Record<string, string>): string => {
	const keys = Object.keys(params).sort();
	return keys.map((k) => `${k}=${params[k]}`).join('&');
};

/**
 * Walk every published page entry plus every `page` / `page-delete` item in
 * the user's open release, producing a per-route view of the editor's site
 * map. `isDraft` flags entries that exist only in the open release (not yet
 * published); `isDeletePending` flags published entries with a staged
 * removal. Routes are alphabetical; entries within a route are alphabetical
 * by serialized params.
 */
export const listAllPages = (userId: string): PageMapRoute[] => {
	const map = new Map<string, Map<string, PageMapEntry>>();

	const ensureRoute = (routeId: string): Map<string, PageMapEntry> => {
		let r = map.get(routeId);
		if (!r) {
			r = new Map();
			map.set(routeId, r);
		}
		return r;
	};

	for (const [routeId, entries] of Object.entries(pageDocs)) {
		const route = ensureRoute(routeId);
		for (const e of entries) {
			route.set(paramsKey(e.params), {
				params: { ...e.params },
				isDraft: false,
				isDeletePending: false
			});
		}
	}

	const release = openReleases[userId];
	if (release) {
		for (const item of release.items) {
			if (item.kind === 'layout') continue;
			const route = ensureRoute(item.routeId);
			const key = paramsKey(item.params);
			const existing = route.get(key);
			if (item.kind === 'page') {
				if (existing) continue;
				route.set(key, {
					params: { ...item.params },
					isDraft: true,
					isDeletePending: false
				});
			} else {
				if (!existing) continue;
				existing.isDeletePending = true;
			}
		}
	}

	const out: PageMapRoute[] = [];
	for (const routeId of [...map.keys()].sort()) {
		const inner = map.get(routeId)!;
		const entries = [...inner.entries()]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([, v]) => v);
		out.push({ routeId, entries });
	}
	return out;
};
