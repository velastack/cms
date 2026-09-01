import { randomBytes, randomUUID } from 'node:crypto';
import { findPageEntry, type PageEntry, type PageDeleteOutcome } from '../../core/page-entry.js';
import { get, leafPaths, mergeTree, set, type Tree } from '../../core/path.js';
import type {
	AddReleaseItemInput,
	CreatePageResult,
	DiscardItemTarget,
	ListMediaOptions,
	ListMediaResult,
	MediaItem,
	OpenRelease,
	PageMapEntry,
	PageMapRoute,
	PublishedRelease,
	PublishedReleaseItem,
	ReleaseItem,
	RenamePageResult,
	StagePageDeleteResult
} from '../../core/wire.js';
import type { SqliteDb } from './sqlite.js';

/** The locale a request falls back to when it names none. */
export const DEFAULT_LOCALE = 'en';

/** An opaque, unguessable key for a release's preview URL. */
export const generatePreviewKey = (): string => randomBytes(8).toString('hex');

/**
 * Every SQL statement and every piece of CMS domain logic, bound to one
 * database connection.
 *
 * This was a module of top-level functions reading a process-wide `getDb()`
 * singleton. Closing over `db` instead is what lets a test file hold its own
 * `':memory:'` database (so the suites run in parallel rather than serialised
 * behind a shared file) and what stops a host from being limited to one CMS per
 * process. The statement helpers below are memoised per instance as a side
 * effect — they previously re-`prepare`d on every single call.
 *
 * The body is otherwise a verbatim move.
 */
export const createStore = (db: SqliteDb) => {
	const nowIso = (): string => new Date().toISOString();

	/** Stable canonical JSON for a params record. Empty params → '{}'. Used as
	 * the partition key for page rows; never exposed to the API. */
	const paramsHash = (params: Record<string, string>): string => {
		const keys = Object.keys(params).sort();
		const out: Record<string, string> = {};
		for (const k of keys) out[k] = params[k];
		return JSON.stringify(out);
	};

	const parseParams = (raw: string | null): Record<string, string> => {
		if (!raw) return {};
		const v: unknown = JSON.parse(raw);
		if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
		return v as Record<string, string>;
	};

	const parseTree = (raw: string | null): Tree | null => {
		if (!raw) return null;
		const v: unknown = JSON.parse(raw);
		if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
		return v as Tree;
	};

	/**
	 * `priorTree` rows can contain `undefined` leaf values, which JSON.stringify
	 * silently drops. The leaf paths matter for revert (undefined → delete the
	 * leaf, anything else → overwrite). We round-trip via a sentinel so the leaf
	 * keys survive serialization.
	 */
	const UNDEFINED_SENTINEL = '__cms_undef__';

	const replaceUndef = (v: unknown): unknown => {
		if (v === undefined) return UNDEFINED_SENTINEL;
		if (Array.isArray(v)) return v.map(replaceUndef);
		if (v && typeof v === 'object') {
			const out: Record<string, unknown> = {};
			for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
				out[k] = replaceUndef(val);
			}
			return out;
		}
		return v;
	};

	const restoreUndef = (v: unknown): unknown => {
		if (v === UNDEFINED_SENTINEL) return undefined;
		if (Array.isArray(v)) return v.map(restoreUndef);
		if (v && typeof v === 'object') {
			const out: Record<string, unknown> = {};
			for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
				out[k] = restoreUndef(val);
			}
			return out;
		}
		return v;
	};

	const serializePriorTree = (tree: Tree | null): string | null =>
		tree === null ? null : JSON.stringify(replaceUndef(tree));

	const parsePriorTree = (raw: string | null): Tree | null => {
		if (!raw) return null;
		const v: unknown = restoreUndef(JSON.parse(raw));
		if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
		return v as Tree;
	};

	const parseOutcome = (raw: string | null): PageDeleteOutcome | undefined => {
		if (!raw) return undefined;
		const v: unknown = JSON.parse(raw);
		if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
		const o = v as { kind?: unknown; to?: unknown };
		if (o.kind === 'gone') return { kind: 'gone' };
		if (o.kind === 'redirect' && typeof o.to === 'string') return { kind: 'redirect', to: o.to };
		return undefined;
	};

	const paramsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
		const aKeys = Object.keys(a);
		if (aKeys.length !== Object.keys(b).length) return false;
		for (const k of aKeys) if (a[k] !== b[k]) return false;
		return true;
	};

	/**
	 * Capture the values of every leaf path in `incoming` as they appear in
	 * `target` right now. Used by publish + revert so the inverse patch tree
	 * restores the same shape that the original patch touched.
	 */
	const capturePriorTree = (target: Tree, incoming: Tree): Tree => {
		const prior: Tree = {};
		for (const path of leafPaths(incoming)) {
			const v = get(target, path);
			set(prior, path, v === undefined ? undefined : structuredClone(v));
		}
		return prior;
	};

	/** Apply restoration values to a target tree. `undefined` deletes the leaf,
	 * other values overwrite. Returns a new tree (does not mutate). */
	const applyRestore = (target: Tree, restore: Tree): Tree => {
		const out = structuredClone(target);
		for (const path of leafPaths(restore)) {
			const v = get(restore, path);
			if (v === undefined) {
				unsetPath(out, path);
			} else {
				set(out, path, v);
			}
		}
		return out;
	};

	const unsetPath = (tree: Tree, path: string): void => {
		const segs = path.split('.');
		if (segs.length === 0) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let cur: any = tree;
		for (let i = 0; i < segs.length - 1; i++) {
			if (cur == null || typeof cur !== 'object') return;
			cur = cur[segs[i]];
		}
		if (cur == null || typeof cur !== 'object') return;
		delete cur[segs[segs.length - 1]];
	};

	const treeHasAnyLeaf = (tree: Tree): boolean => {
		for (const v of Object.values(tree)) if (v !== undefined) return true;
		return false;
	};

	// ---------------------------------------------------------------------------
	// Project state
	// ---------------------------------------------------------------------------

	const ensureProjectStateStmt = () =>
		db.prepare<[string]>(
			'INSERT INTO project_state (project_id) VALUES (?) ON CONFLICT DO NOTHING'
		);

	const bumpProjectVersionStmt = () =>
		db.prepare<[string]>(
			'UPDATE project_state SET cms_version = cms_version + 1 WHERE project_id = ?'
		);

	const nextSeqStmt = () =>
		db.prepare<[string], { seq: number }>(
			'SELECT last_release_seq + 1 AS seq FROM project_state WHERE project_id = ?'
		);

	const setLastSeqStmt = () =>
		db.prepare<[number, string]>(
			'UPDATE project_state SET last_release_seq = ?, cms_version = cms_version + 1 WHERE project_id = ?'
		);

	const ensureProjectState = (projectId: string): void => {
		ensureProjectStateStmt().run(projectId);
	};

	const getCmsVersionStmt = () =>
		db.prepare<[string], { cms_version: number }>(
			'SELECT cms_version FROM project_state WHERE project_id = ?'
		);

	/**
	 * Per-project monotonic version stamp. Bumped on every publish (and revert).
	 * Used as the ETag basis for HTTP caching and to invalidate the in-process
	 * LRU. Returns 0 for projects that haven't published anything yet.
	 */
	const getCmsVersion = (projectId: string): number => {
		const row = getCmsVersionStmt().get(projectId);
		return row?.cms_version ?? 0;
	};

	// ---------------------------------------------------------------------------
	// Published page / layout reads
	// ---------------------------------------------------------------------------

	type PublishedPageRow = {
		params: string;
		tree: string;
		tombstone: string | null;
	};

	const getPublishedPageRowStmt = () =>
		db.prepare<[string, string, string, string], PublishedPageRow>(
			'SELECT params, tree, tombstone FROM published_pages WHERE project_id = ? AND locale = ? AND route_id = ? AND params_hash = ?'
		);

	const listPublishedPageRowsStmt = () =>
		db.prepare<[string, string, string], PublishedPageRow>(
			'SELECT params, tree, tombstone FROM published_pages WHERE project_id = ? AND locale = ? AND route_id = ? ORDER BY params_hash'
		);

	const getPublishedLayoutTreeStmt = () =>
		db.prepare<[string, string, string], { tree: string }>(
			'SELECT tree FROM published_layouts WHERE project_id = ? AND locale = ? AND route_id = ?'
		);

	const allPageRouteIdsStmt = () =>
		db.prepare<[string], { route_id: string }>(
			'SELECT DISTINCT route_id FROM published_pages WHERE project_id = ?'
		);

	const allPagesByLocaleStmt = () =>
		db.prepare<
			[string, string],
			{ route_id: string; params: string; tree: string; tombstone: string | null }
		>(
			'SELECT route_id, params, tree, tombstone FROM published_pages WHERE project_id = ? AND locale = ? ORDER BY route_id, params_hash'
		);

	const allLayoutsByLocaleStmt = () =>
		db.prepare<[string, string], { route_id: string; tree: string }>(
			'SELECT route_id, tree FROM published_layouts WHERE project_id = ? AND locale = ? ORDER BY route_id'
		);

	const allLocalesForProjectStmt = () =>
		db.prepare<[string, string], { locale: string }>(
			`SELECT DISTINCT locale FROM published_pages WHERE project_id = ?
			 UNION
			 SELECT DISTINCT locale FROM published_layouts WHERE project_id = ?`
		);

	const distinctParamValuesStmt = () =>
		db.prepare<[string, string], { params: string }>(
			'SELECT DISTINCT params FROM published_pages WHERE project_id = ? AND route_id = ?'
		);

	/** Return the published `PageEntry` for a single scope, or null. */
	const getPublishedPageEntry = (
		projectId: string,
		locale: string,
		routeId: string,
		params: Record<string, string>
	): PageEntry | null => {
		const row = getPublishedPageRowStmt().get(projectId, locale, routeId, paramsHash(params));
		if (!row) return null;
		const published = parseTree(row.tree) ?? {};
		const tombstone = parseOutcome(row.tombstone);
		const entry: PageEntry = { params: parseParams(row.params), published };
		if (tombstone) entry.tombstone = tombstone;
		return entry;
	};

	/** Return all published `PageEntry` rows for a route+locale (one per param set). */
	const getPublishedPageEntries = (
		projectId: string,
		locale: string,
		routeId: string
	): PageEntry[] => {
		const rows = listPublishedPageRowsStmt().all(projectId, locale, routeId);
		return rows.map((r) => {
			const entry: PageEntry = {
				params: parseParams(r.params),
				published: parseTree(r.tree) ?? {}
			};
			const tombstone = parseOutcome(r.tombstone);
			if (tombstone) entry.tombstone = tombstone;
			return entry;
		});
	};

	/** Return the published layout tree for a single scope, or null. */
	const getPublishedLayoutTree = (
		projectId: string,
		locale: string,
		routeId: string
	): Tree | null => {
		const row = getPublishedLayoutTreeStmt().get(projectId, locale, routeId);
		return row ? parseTree(row.tree) : null;
	};

	/** Distinct route IDs that have at least one published page row in any locale. */
	const allPageRouteIds = (projectId: string): string[] =>
		allPageRouteIdsStmt()
			.all(projectId)
			.map((r) => r.route_id);

	// ---------------------------------------------------------------------------
	// Published site reads
	// ---------------------------------------------------------------------------

	const SITE_SENTINEL = '__site__';

	const getPublishedSiteTreeStmt = () =>
		db.prepare<[string], { tree: string }>('SELECT tree FROM published_site WHERE project_id = ?');

	/** Return the published site tree for a project, or `{}` if none yet. */
	const getPublishedSiteTree = (projectId: string): Tree => {
		const row = getPublishedSiteTreeStmt().get(projectId);
		return row ? (parseTree(row.tree) ?? {}) : {};
	};

	const upsertPublishedSiteStmt = () =>
		db.prepare<[string, string, string, string]>(
			`INSERT INTO published_site (project_id, tree, updated_at, updated_by_release)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(project_id) DO UPDATE SET
			   tree = excluded.tree,
			   updated_at = excluded.updated_at,
			   updated_by_release = excluded.updated_by_release`
		);

	/**
	 * Distinct values of one `[param]` segment seen across every locale's
	 * published pages for the route. Mirrors `_store.ts`'s `listPageParamValues`.
	 */
	const listPageParamValues = (projectId: string, routeId: string, param: string): string[] => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const r of distinctParamValuesStmt().all(projectId, routeId)) {
			const params = parseParams(r.params);
			const v = params[param];
			if (typeof v !== 'string' || seen.has(v)) continue;
			seen.add(v);
			out.push(v);
		}
		return out;
	};

	// ---------------------------------------------------------------------------
	// Open release reads
	// ---------------------------------------------------------------------------

	type OpenReleaseRow = {
		user_id: string;
		name: string | null;
		created_at: string;
		preview_key: string;
	};

	type OpenReleaseItemRow = {
		kind: 'page' | 'layout' | 'page-delete' | 'site';
		route_id: string;
		locale: string;
		params: string | null;
		tree: string | null;
		outcome: string | null;
		added_at: string;
	};

	const getOpenReleaseStmt = () =>
		db.prepare<[string, string], OpenReleaseRow>(
			'SELECT user_id, name, created_at, preview_key FROM open_releases WHERE project_id = ? AND user_id = ?'
		);

	const listOpenReleaseItemsStmt = () =>
		db.prepare<[string, string], OpenReleaseItemRow>(
			'SELECT kind, route_id, locale, params, tree, outcome, added_at FROM open_release_items WHERE project_id = ? AND user_id = ? ORDER BY id'
		);

	const findOpenReleaseByPreviewKeyStmt = () =>
		db.prepare<[string, string], OpenReleaseRow>(
			'SELECT user_id, name, created_at, preview_key FROM open_releases WHERE project_id = ? AND preview_key = ?'
		);

	const rowToReleaseItem = (r: OpenReleaseItemRow): ReleaseItem => {
		if (r.kind === 'layout') {
			return {
				kind: 'layout',
				routeId: r.route_id,
				locale: r.locale,
				tree: parseTree(r.tree) ?? {},
				addedAt: r.added_at
			};
		}
		if (r.kind === 'page') {
			return {
				kind: 'page',
				routeId: r.route_id,
				locale: r.locale,
				params: parseParams(r.params),
				tree: parseTree(r.tree) ?? {},
				addedAt: r.added_at
			};
		}
		if (r.kind === 'site') {
			return {
				kind: 'site',
				tree: parseTree(r.tree) ?? {},
				addedAt: r.added_at
			};
		}
		const outcome = parseOutcome(r.outcome);
		const item: ReleaseItem = {
			kind: 'page-delete',
			routeId: r.route_id,
			locale: r.locale,
			params: parseParams(r.params),
			addedAt: r.added_at
		};
		if (outcome) item.outcome = outcome;
		return item;
	};

	const buildOpenRelease = (projectId: string, row: OpenReleaseRow): OpenRelease => {
		const items = listOpenReleaseItemsStmt().all(projectId, row.user_id).map(rowToReleaseItem);
		const release: OpenRelease = {
			userId: row.user_id,
			createdAt: row.created_at,
			preview_key: row.preview_key,
			items
		};
		if (row.name != null) release.name = row.name;
		return release;
	};

	const getOpenRelease = (projectId: string, userId: string): OpenRelease | null => {
		const row = getOpenReleaseStmt().get(projectId, userId);
		return row ? buildOpenRelease(projectId, row) : null;
	};

	const findOpenReleaseByPreviewKey = (projectId: string, key: string): OpenRelease | null => {
		const row = findOpenReleaseByPreviewKeyStmt().get(projectId, key);
		return row ? buildOpenRelease(projectId, row) : null;
	};

	/** Snapshot of an open release for the api-adapter overlay path. */
	const lookupReleaseByPreviewKey = (
		projectId: string,
		key: string
	): { id: string; items: ReleaseItem[] } | null => {
		const release = findOpenReleaseByPreviewKey(projectId, key);
		if (!release) return null;
		return { id: release.userId, items: release.items };
	};

	// ---------------------------------------------------------------------------
	// Open release writes
	// ---------------------------------------------------------------------------

	const ensureOpenReleaseStmt = () =>
		db.prepare<[string, string, string, string]>(
			'INSERT INTO open_releases (project_id, user_id, created_at, preview_key) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
		);

	const findOpenItemStmt = () =>
		db.prepare<
			[string, string, string, string, string, string],
			{ id: number; tree: string | null; outcome: string | null }
		>(
			'SELECT id, tree, outcome FROM open_release_items WHERE project_id = ? AND user_id = ? AND kind = ? AND route_id = ? AND locale = ? AND params_hash = ?'
		);

	const updateOpenItemTreeStmt = () =>
		db.prepare<[string, string, number]>(
			'UPDATE open_release_items SET tree = ?, added_at = ? WHERE id = ?'
		);

	const updateOpenItemOutcomeStmt = () =>
		db.prepare<[string | null, string, number]>(
			'UPDATE open_release_items SET outcome = ?, added_at = ? WHERE id = ?'
		);

	const insertOpenItemStmt = () =>
		db.prepare<
			[
				string,
				string,
				string,
				string,
				string,
				string,
				string | null,
				string | null,
				string | null,
				string
			]
		>(
			'INSERT INTO open_release_items (project_id, user_id, kind, route_id, locale, params_hash, params, tree, outcome, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);

	const deleteOpenReleaseStmt = () =>
		db.prepare<[string, string]>('DELETE FROM open_releases WHERE project_id = ? AND user_id = ?');

	const deleteOpenItemStmt = () =>
		db.prepare<[string, string, string, string, string, string], { id: number }>(
			'DELETE FROM open_release_items WHERE project_id = ? AND user_id = ? AND kind = ? AND route_id = ? AND locale = ? AND params_hash = ? RETURNING id'
		);

	const updateOpenReleasePreviewKeyStmt = () =>
		db.prepare<[string, string, string]>(
			'UPDATE open_releases SET preview_key = ? WHERE project_id = ? AND user_id = ?'
		);

	const ensureOpenRelease = (projectId: string, userId: string): void => {
		ensureProjectState(projectId);
		ensureOpenReleaseStmt().run(projectId, userId, nowIso(), generatePreviewKey());
	};

	/**
	 * Add or merge items into the user's open release. Existing scopes get their
	 * tree deep-merged via `mergeTree` (last-write-wins at the leaf, arrays
	 * replace wholesale). Same scope+routeId in two locales is two distinct rows.
	 */
	const addReleaseItems = (
		projectId: string,
		userId: string,
		inputs: AddReleaseItemInput[]
	): OpenRelease => {
		const tx = db.transaction(() => {
			ensureOpenRelease(projectId, userId);
			const now = nowIso();
			for (const input of inputs) {
				if (!treeHasAnyLeaf(input.tree)) continue;
				const routeId = input.kind === 'site' ? SITE_SENTINEL : input.routeId;
				const locale = input.kind === 'site' ? SITE_SENTINEL : input.locale;
				const params = input.kind === 'page' ? input.params : {};
				const hash = input.kind === 'page' ? paramsHash(params) : '';
				const existing = findOpenItemStmt().get(
					projectId,
					userId,
					input.kind,
					routeId,
					locale,
					hash
				);
				if (existing) {
					const prevTree = parseTree(existing.tree) ?? {};
					const merged = mergeTree(prevTree, input.tree);
					updateOpenItemTreeStmt().run(JSON.stringify(merged), now, existing.id);
				} else {
					insertOpenItemStmt().run(
						projectId,
						userId,
						input.kind,
						routeId,
						locale,
						hash,
						input.kind === 'page' ? JSON.stringify(params) : null,
						JSON.stringify(structuredClone(input.tree)),
						null,
						now
					);
				}
			}
		});
		tx();
		return getOpenRelease(projectId, userId)!;
	};

	const discardReleaseItem = (
		projectId: string,
		userId: string,
		target: DiscardItemTarget
	): boolean => {
		if (target.kind === 'site') {
			const removed = deleteOpenItemStmt().get(
				projectId,
				userId,
				'site',
				SITE_SENTINEL,
				SITE_SENTINEL,
				''
			);
			return !!removed;
		}
		const params = 'params' in target ? target.params : {};
		const hash = target.kind === 'layout' ? '' : paramsHash(params);
		const removed = deleteOpenItemStmt().get(
			projectId,
			userId,
			target.kind,
			target.routeId,
			target.locale,
			hash
		);
		return !!removed;
	};

	const discardOpenRelease = (projectId: string, userId: string): boolean => {
		const result = deleteOpenReleaseStmt().run(projectId, userId);
		return result.changes > 0;
	};

	const regeneratePreviewKey = (projectId: string, userId: string): string | null => {
		const row = getOpenReleaseStmt().get(projectId, userId);
		if (!row) return null;
		const key = generatePreviewKey();
		updateOpenReleasePreviewKeyStmt().run(key, projectId, userId);
		return key;
	};

	// ---------------------------------------------------------------------------
	// Page lifecycle (create / stage delete)
	// ---------------------------------------------------------------------------

	const findPendingPageItemAcrossUsersStmt = () =>
		db.prepare<[string, string, string, string], { user_id: string }>(
			"SELECT user_id FROM open_release_items WHERE project_id = ? AND kind = 'page' AND route_id = ? AND locale = ? AND params_hash = ? LIMIT 1"
		);

	const createPage = (
		projectId: string,
		userId: string,
		routeId: string,
		locale: string,
		params: Record<string, string>,
		metadata: Record<string, unknown> = {}
	): CreatePageResult => {
		const hash = paramsHash(params);
		const tx = db.transaction((): CreatePageResult => {
			const existing = getPublishedPageRowStmt().get(projectId, locale, routeId, hash);
			if (existing) return { ok: false, reason: 'exists' };
			const pending = findPendingPageItemAcrossUsersStmt().get(projectId, routeId, locale, hash);
			if (pending) return { ok: false, reason: 'exists' };
			ensureOpenRelease(projectId, userId);
			const now = nowIso();
			insertOpenItemStmt().run(
				projectId,
				userId,
				'page',
				routeId,
				locale,
				hash,
				JSON.stringify(params),
				JSON.stringify({ metadata }),
				null,
				now
			);
			return { ok: true };
		});
		return tx();
	};

	/**
	 * Move a published or drafted page from one set of params to another — a
	 * slug rename.
	 *
	 * The admin bar has posted to `/pages/rename` since it shipped and nothing
	 * answered, so renaming silently did nothing. Two cases:
	 *
	 * - **Draft only** (nothing published at `fromParams`): re-key the open
	 *   release item. There is no published URL to redirect from, so no
	 *   tombstone is staged.
	 * - **Published**: stage a page item at `toParams` carrying the merged
	 *   published + drafted tree, and stage a `page-delete` at `fromParams`
	 *   whose outcome redirects to `toUrl`, so the old address keeps working
	 *   once the release is published.
	 *
	 * The draft at `fromParams` must be removed *before* staging the delete:
	 * `stagePageDelete` refuses with `has-draft` while a page item exists at the
	 * same scope.
	 */
	const renamePage = (
		projectId: string,
		userId: string,
		args: {
			routeId: string;
			locale: string;
			fromParams: Record<string, string>;
			toParams: Record<string, string>;
			toUrl: string;
		}
	): RenamePageResult => {
		const { routeId, locale, fromParams, toParams, toUrl } = args;
		const fromHash = paramsHash(fromParams);
		const toHash = paramsHash(toParams);
		if (fromHash === toHash) return { ok: false, reason: 'same-params' };

		const tx = db.transaction((): RenamePageResult => {
			const publishedFrom = getPublishedPageRowStmt().get(projectId, locale, routeId, fromHash);
			const draftFrom = findOpenItemStmt().get(
				projectId,
				userId,
				'page',
				routeId,
				locale,
				fromHash
			);
			if (!publishedFrom && !draftFrom) return { ok: false, reason: 'not-found' };

			// The destination must be free, both published and across everyone's
			// pending drafts — two editors must not race onto the same slug.
			if (getPublishedPageRowStmt().get(projectId, locale, routeId, toHash)) {
				return { ok: false, reason: 'exists' };
			}
			if (findPendingPageItemAcrossUsersStmt().get(projectId, routeId, locale, toHash)) {
				return { ok: false, reason: 'exists' };
			}

			// The new page carries everything the old one resolved to: there is
			// no published row behind `toParams` to merge onto later.
			const tree = mergeTree(
				parseTree(publishedFrom?.tree ?? null) ?? {},
				parseTree(draftFrom?.tree ?? null) ?? {}
			);

			ensureOpenRelease(projectId, userId);
			const now = nowIso();

			if (draftFrom) {
				deleteOpenItemStmt().get(projectId, userId, 'page', routeId, locale, fromHash);
			}

			insertOpenItemStmt().run(
				projectId,
				userId,
				'page',
				routeId,
				locale,
				toHash,
				JSON.stringify(toParams),
				JSON.stringify(tree),
				null,
				now
			);

			if (publishedFrom) {
				const outcome: PageDeleteOutcome = { kind: 'redirect', to: toUrl };
				const pending = findOpenItemStmt().get(
					projectId,
					userId,
					'page-delete',
					routeId,
					locale,
					fromHash
				);
				if (pending) {
					updateOpenItemOutcomeStmt().run(JSON.stringify(outcome), now, pending.id);
				} else {
					insertOpenItemStmt().run(
						projectId,
						userId,
						'page-delete',
						routeId,
						locale,
						fromHash,
						JSON.stringify(fromParams),
						null,
						JSON.stringify(outcome),
						now
					);
				}
			}

			const release = getOpenRelease(projectId, userId);
			if (!release) return { ok: false, reason: 'not-found' };
			return { ok: true, release };
		});
		return tx();
	};

	const stagePageDelete = (
		projectId: string,
		userId: string,
		routeId: string,
		locale: string,
		params: Record<string, string>,
		outcome?: PageDeleteOutcome
	): StagePageDeleteResult => {
		const hash = paramsHash(params);
		const tx = db.transaction((): StagePageDeleteResult => {
			const published = getPublishedPageRowStmt().get(projectId, locale, routeId, hash);
			if (!published) return { ok: false, reason: 'not-published' };
			const draft = findOpenItemStmt().get(projectId, userId, 'page', routeId, locale, hash);
			if (draft) return { ok: false, reason: 'has-draft' };
			const pending = findOpenItemStmt().get(
				projectId,
				userId,
				'page-delete',
				routeId,
				locale,
				hash
			);
			const now = nowIso();
			if (pending) {
				updateOpenItemOutcomeStmt().run(outcome ? JSON.stringify(outcome) : null, now, pending.id);
				return { ok: true, alreadyStaged: true };
			}
			ensureOpenRelease(projectId, userId);
			insertOpenItemStmt().run(
				projectId,
				userId,
				'page-delete',
				routeId,
				locale,
				hash,
				JSON.stringify(params),
				null,
				outcome ? JSON.stringify(outcome) : null,
				now
			);
			return { ok: true, alreadyStaged: false };
		});
		return tx();
	};

	// ---------------------------------------------------------------------------
	// Publish
	// ---------------------------------------------------------------------------

	const upsertPublishedPageStmt = () =>
		db.prepare<[string, string, string, string, string, string, string | null, string, string]>(
			`INSERT INTO published_pages (project_id, locale, route_id, params_hash, params, tree, tombstone, updated_at, updated_by_release)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(project_id, locale, route_id, params_hash) DO UPDATE SET
			   tree = excluded.tree,
			   tombstone = excluded.tombstone,
			   updated_at = excluded.updated_at,
			   updated_by_release = excluded.updated_by_release`
		);

	const upsertPublishedLayoutStmt = () =>
		db.prepare<[string, string, string, string, string, string]>(
			`INSERT INTO published_layouts (project_id, locale, route_id, tree, updated_at, updated_by_release)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(project_id, locale, route_id) DO UPDATE SET
			   tree = excluded.tree,
			   updated_at = excluded.updated_at,
			   updated_by_release = excluded.updated_by_release`
		);

	const updatePublishedPageTombstoneStmt = () =>
		db.prepare<[string | null, string, string, string, string, string, string]>(
			'UPDATE published_pages SET tombstone = ?, updated_at = ?, updated_by_release = ? WHERE project_id = ? AND locale = ? AND route_id = ? AND params_hash = ?'
		);

	const deletePublishedPageStmt = () =>
		db.prepare<[string, string, string, string]>(
			'DELETE FROM published_pages WHERE project_id = ? AND locale = ? AND route_id = ? AND params_hash = ?'
		);

	const insertReleaseStmt = () =>
		db.prepare<[string, string, number, string | null, string, string, string]>(
			'INSERT INTO releases (id, project_id, seq, name, published_by, published_at, preview_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);

	const insertReleaseItemStmt = () =>
		db.prepare<
			[
				string,
				string,
				number,
				string,
				string,
				string,
				string | null,
				string | null,
				string | null,
				string | null,
				string | null,
				string | null,
				string
			]
		>(
			'INSERT INTO release_items (release_id, project_id, seq, kind, route_id, locale, params_hash, params, tree, prior_tree, outcome, prior_tombstone, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);

	const deleteOpenItemsForUserStmt = () =>
		db.prepare<[string, string]>(
			'DELETE FROM open_release_items WHERE project_id = ? AND user_id = ?'
		);

	/**
	 * Apply every item in the user's open release atomically: capture each item's
	 * prior leaf values, write the merged tree to `published_pages`/`published_layouts`,
	 * insert the release header + items, bump the project version, and clear the
	 * open release. Returns the new `PublishedRelease`, or null if there's nothing
	 * to publish.
	 */
	const publishRelease = (
		projectId: string,
		userId: string,
		name?: string
	): PublishedRelease | null => {
		const tx = db.transaction((): PublishedRelease | null => {
			ensureProjectState(projectId);
			const releaseRow = getOpenReleaseStmt().get(projectId, userId);
			if (!releaseRow) return null;

			const items = listOpenReleaseItemsStmt().all(projectId, userId).map(rowToReleaseItem);
			if (items.length === 0) return null;

			const seqRow = nextSeqStmt().get(projectId);
			const seq = seqRow?.seq ?? 1;

			const releaseId = randomUUID();
			const publishedAt = nowIso();
			const previewKey = generatePreviewKey();
			const publishedItems: PublishedReleaseItem[] = [];

			// Insert the release header up front so release_items.release_id FK
			// resolves on every per-item insert below. We delete the header at the
			// end if the body turned out to be empty.
			const finalName = name ?? releaseRow.name ?? null;
			insertReleaseStmt().run(
				releaseId,
				projectId,
				seq,
				finalName,
				userId,
				publishedAt,
				previewKey
			);

			for (const item of items) {
				if (item.kind === 'site') {
					const target = getPublishedSiteTree(projectId);
					const priorTree = capturePriorTree(target, item.tree);
					const merged = mergeTree(target, item.tree);
					upsertPublishedSiteStmt().run(projectId, JSON.stringify(merged), publishedAt, releaseId);
					const published: PublishedReleaseItem = {
						kind: 'site',
						tree: structuredClone(item.tree),
						priorTree
					};
					publishedItems.push(published);
					insertReleaseItemStmt().run(
						releaseId,
						projectId,
						seq,
						'site',
						SITE_SENTINEL,
						SITE_SENTINEL,
						null,
						null,
						JSON.stringify(item.tree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				} else if (item.kind === 'layout') {
					const existing = getPublishedLayoutTreeStmt().get(projectId, item.locale, item.routeId);
					const target = existing ? (parseTree(existing.tree) ?? {}) : {};
					const priorTree = capturePriorTree(target, item.tree);
					const merged = mergeTree(target, item.tree);
					upsertPublishedLayoutStmt().run(
						projectId,
						item.locale,
						item.routeId,
						JSON.stringify(merged),
						publishedAt,
						releaseId
					);
					const published: PublishedReleaseItem = {
						kind: 'layout',
						routeId: item.routeId,
						locale: item.locale,
						tree: structuredClone(item.tree),
						priorTree
					};
					publishedItems.push(published);
					insertReleaseItemStmt().run(
						releaseId,
						projectId,
						seq,
						'layout',
						item.routeId,
						item.locale,
						null,
						null,
						JSON.stringify(item.tree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				} else if (item.kind === 'page') {
					const hash = paramsHash(item.params);
					const existing = getPublishedPageRowStmt().get(
						projectId,
						item.locale,
						item.routeId,
						hash
					);
					const target = existing ? (parseTree(existing.tree) ?? {}) : {};
					const priorTree = existing ? capturePriorTree(target, item.tree) : null;
					const merged = mergeTree(target, item.tree);
					const tombstone = existing?.tombstone ?? null;
					upsertPublishedPageStmt().run(
						projectId,
						item.locale,
						item.routeId,
						hash,
						JSON.stringify(item.params),
						JSON.stringify(merged),
						tombstone,
						publishedAt,
						releaseId
					);
					const published: PublishedReleaseItem = {
						kind: 'page',
						routeId: item.routeId,
						locale: item.locale,
						params: { ...item.params },
						tree: structuredClone(item.tree),
						priorTree
					};
					publishedItems.push(published);
					insertReleaseItemStmt().run(
						releaseId,
						projectId,
						seq,
						'page',
						item.routeId,
						item.locale,
						hash,
						JSON.stringify(item.params),
						JSON.stringify(item.tree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				} else {
					// page-delete: outcome present → set tombstone + keep tree; absent → delete row.
					const hash = paramsHash(item.params);
					const existing = getPublishedPageRowStmt().get(
						projectId,
						item.locale,
						item.routeId,
						hash
					);
					if (!existing) continue;
					const priorTree = parseTree(existing.tree) ?? {};
					const priorTombstone = parseOutcome(existing.tombstone);
					if (item.outcome) {
						updatePublishedPageTombstoneStmt().run(
							JSON.stringify(item.outcome),
							publishedAt,
							releaseId,
							projectId,
							item.locale,
							item.routeId,
							hash
						);
					} else {
						deletePublishedPageStmt().run(projectId, item.locale, item.routeId, hash);
					}
					const published: PublishedReleaseItem = {
						kind: 'page-delete',
						routeId: item.routeId,
						locale: item.locale,
						params: { ...item.params },
						priorTree
					};
					if (item.outcome) published.outcome = item.outcome;
					if (priorTombstone) published.priorTombstone = priorTombstone;
					publishedItems.push(published);
					insertReleaseItemStmt().run(
						releaseId,
						projectId,
						seq,
						'page-delete',
						item.routeId,
						item.locale,
						hash,
						JSON.stringify(item.params),
						null,
						serializePriorTree(priorTree),
						item.outcome ? JSON.stringify(item.outcome) : null,
						priorTombstone ? JSON.stringify(priorTombstone) : null,
						publishedAt
					);
				}
			}

			if (publishedItems.length === 0) {
				// Roll back the speculative header insert from above.
				db.prepare('DELETE FROM releases WHERE id = ?').run(releaseId);
				return null;
			}

			setLastSeqStmt().run(seq, projectId);
			deleteOpenItemsForUserStmt().run(projectId, userId);
			deleteOpenReleaseStmt().run(projectId, userId);

			const result: PublishedRelease = {
				id: releaseId,
				publishedBy: userId,
				publishedAt,
				preview_key: previewKey,
				items: publishedItems
			};
			if (finalName != null) result.name = finalName;
			return result;
		});
		return tx();
	};

	// ---------------------------------------------------------------------------
	// Release history reads
	// ---------------------------------------------------------------------------

	type ReleaseRow = {
		id: string;
		name: string | null;
		published_by: string;
		published_at: string;
		preview_key: string;
		reverted_at: string | null;
	};

	type ReleaseItemRow = {
		kind: 'page' | 'layout' | 'page-delete' | 'site';
		route_id: string;
		locale: string;
		params: string | null;
		tree: string | null;
		prior_tree: string | null;
		outcome: string | null;
		prior_tombstone: string | null;
	};

	const listReleaseHistoryStmt = () =>
		db.prepare<[string], ReleaseRow>(
			'SELECT id, name, published_by, published_at, preview_key, reverted_at FROM releases WHERE project_id = ? ORDER BY seq ASC'
		);

	const findReleaseByPreviewKeyStmt = () =>
		db.prepare<[string, string], ReleaseRow & { seq: number }>(
			'SELECT id, name, published_by, published_at, preview_key, reverted_at, seq FROM releases WHERE project_id = ? AND preview_key = ?'
		);

	const getReleaseByIdStmt = () =>
		db.prepare<[string, string], ReleaseRow & { seq: number }>(
			'SELECT id, name, published_by, published_at, preview_key, reverted_at, seq FROM releases WHERE project_id = ? AND id = ?'
		);

	const listReleaseItemsByReleaseIdStmt = () =>
		db.prepare<[string], ReleaseItemRow>(
			'SELECT kind, route_id, locale, params, tree, prior_tree, outcome, prior_tombstone FROM release_items WHERE release_id = ? ORDER BY id'
		);

	const listReleaseItemsAfterSeqStmt = () =>
		db.prepare<[string, number], ReleaseItemRow & { seq: number }>(
			'SELECT seq, kind, route_id, locale, params, tree, prior_tree, outcome, prior_tombstone FROM release_items WHERE project_id = ? AND seq > ? ORDER BY seq DESC, id DESC'
		);

	const updateReleasePreviewKeyStmt = () =>
		db.prepare<[string, string]>('UPDATE releases SET preview_key = ? WHERE id = ?');

	const setReleaseRevertedAtStmt = () =>
		db.prepare<[string, string]>('UPDATE releases SET reverted_at = ? WHERE id = ?');

	const rowToPublishedItem = (r: ReleaseItemRow): PublishedReleaseItem => {
		const priorTree = parsePriorTree(r.prior_tree);
		const priorTombstone = parseOutcome(r.prior_tombstone);
		if (r.kind === 'layout') {
			const item: PublishedReleaseItem = {
				kind: 'layout',
				routeId: r.route_id,
				locale: r.locale,
				tree: parseTree(r.tree) ?? {},
				priorTree: priorTree ?? {}
			};
			return item;
		}
		if (r.kind === 'page') {
			const item: PublishedReleaseItem = {
				kind: 'page',
				routeId: r.route_id,
				locale: r.locale,
				params: parseParams(r.params),
				tree: parseTree(r.tree) ?? {},
				priorTree
			};
			return item;
		}
		if (r.kind === 'site') {
			return {
				kind: 'site',
				tree: parseTree(r.tree) ?? {},
				priorTree: priorTree ?? {}
			};
		}
		const outcome = parseOutcome(r.outcome);
		const item: PublishedReleaseItem = {
			kind: 'page-delete',
			routeId: r.route_id,
			locale: r.locale,
			params: parseParams(r.params),
			priorTree
		};
		if (outcome) item.outcome = outcome;
		if (priorTombstone) item.priorTombstone = priorTombstone;
		return item;
	};

	const buildPublishedRelease = (projectId: string, row: ReleaseRow): PublishedRelease => {
		const items = listReleaseItemsByReleaseIdStmt().all(row.id).map(rowToPublishedItem);
		const r: PublishedRelease = {
			id: row.id,
			publishedBy: row.published_by,
			publishedAt: row.published_at,
			preview_key: row.preview_key,
			items
		};
		if (row.name != null) r.name = row.name;
		if (row.reverted_at != null) r.revertedAt = row.reverted_at;
		return r;
	};

	const getReleaseHistory = (projectId: string): PublishedRelease[] =>
		listReleaseHistoryStmt()
			.all(projectId)
			.map((r) => buildPublishedRelease(projectId, r));

	const findPublishedReleaseByPreviewKey = (
		projectId: string,
		key: string
	): PublishedRelease | null => {
		const row = findReleaseByPreviewKeyStmt().get(projectId, key);
		return row ? buildPublishedRelease(projectId, row) : null;
	};

	const regeneratePublishedPreviewKey = (projectId: string, releaseId: string): string | null => {
		const row = getReleaseByIdStmt().get(projectId, releaseId);
		if (!row) return null;
		const key = generatePreviewKey();
		updateReleasePreviewKeyStmt().run(key, releaseId);
		return key;
	};

	// ---------------------------------------------------------------------------
	// Historical state reconstruction
	// ---------------------------------------------------------------------------

	type StateSnapshot = {
		layoutSnap: Record<string, Record<string, Tree>>;
		pageSnap: Record<string, Record<string, PageEntry[]>>;
		siteSnap: Tree;
	};

	const cloneCurrentState = (projectId: string): StateSnapshot => {
		const layoutSnap: Record<string, Record<string, Tree>> = {};
		const pageSnap: Record<string, Record<string, PageEntry[]>> = {};
		const locales = allLocalesForProjectStmt()
			.all(projectId, projectId)
			.map((r) => r.locale);
		for (const locale of locales) {
			const layoutBucket: Record<string, Tree> = {};
			for (const r of allLayoutsByLocaleStmt().all(projectId, locale)) {
				layoutBucket[r.route_id] = parseTree(r.tree) ?? {};
			}
			layoutSnap[locale] = layoutBucket;

			const pageBucket: Record<string, PageEntry[]> = {};
			for (const r of allPagesByLocaleStmt().all(projectId, locale)) {
				const params = parseParams(r.params);
				const entry: PageEntry = { params, published: parseTree(r.tree) ?? {} };
				const tombstone = parseOutcome(r.tombstone);
				if (tombstone) entry.tombstone = tombstone;
				(pageBucket[r.route_id] ??= []).push(entry);
			}
			pageSnap[locale] = pageBucket;
		}
		return { layoutSnap, pageSnap, siteSnap: structuredClone(getPublishedSiteTree(projectId)) };
	};

	/**
	 * Reconstruct the live state at the moment a release shipped: clone current
	 * materialized state, then walk every release published *after* the target
	 * newest-to-oldest, applying each item's `priorTree` to undo it. The target
	 * release itself stays applied. Pure on the cloned trees.
	 */
	const buildStateAtRelease = (projectId: string, releaseId: string): StateSnapshot | null => {
		const target = getReleaseByIdStmt().get(projectId, releaseId);
		if (!target) return null;

		const snap = cloneCurrentState(projectId);

		for (const r of listReleaseItemsAfterSeqStmt().all(projectId, target.seq)) {
			const item = rowToPublishedItem(r);
			if (item.kind === 'site') {
				snap.siteSnap = applyRestore(snap.siteSnap, item.priorTree ?? {});
			} else if (item.kind === 'layout') {
				const localeBucket = (snap.layoutSnap[item.locale] ??= {});
				const tree = localeBucket[item.routeId] ?? {};
				localeBucket[item.routeId] = applyRestore(tree, item.priorTree ?? {});
			} else if (item.kind === 'page') {
				const localeBucket = (snap.pageSnap[item.locale] ??= {});
				if (item.priorTree == null) {
					const entries = localeBucket[item.routeId];
					if (!entries) continue;
					const idx = entries.findIndex((e) => paramsEqual(e.params, item.params));
					if (idx < 0) continue;
					entries.splice(idx, 1);
				} else {
					const entries = (localeBucket[item.routeId] ??= []);
					let entry = findPageEntry(entries, item.params);
					if (!entry) {
						entry = { params: { ...item.params }, published: {} };
						entries.push(entry);
					}
					entry.published = applyRestore(entry.published, item.priorTree);
				}
			} else {
				const localeBucket = (snap.pageSnap[item.locale] ??= {});
				const entries = (localeBucket[item.routeId] ??= []);
				if (!item.outcome) {
					if (findPageEntry(entries, item.params)) continue;
					entries.push({
						params: { ...item.params },
						published: structuredClone(item.priorTree ?? {})
					});
				} else {
					const entry = findPageEntry(entries, item.params);
					if (!entry) continue;
					if (item.priorTombstone) entry.tombstone = item.priorTombstone;
					else delete entry.tombstone;
				}
			}
		}

		return snap;
	};

	// ---------------------------------------------------------------------------
	// Revert
	// ---------------------------------------------------------------------------

	const revertRelease = (
		projectId: string,
		releaseId: string,
		userId: string
	): PublishedRelease | null => {
		const tx = db.transaction((): PublishedRelease | null => {
			ensureProjectState(projectId);
			const sourceRow = getReleaseByIdStmt().get(projectId, releaseId);
			if (!sourceRow) return null;
			const sourceItems = listReleaseItemsByReleaseIdStmt().all(releaseId).map(rowToPublishedItem);

			const seqRow = nextSeqStmt().get(projectId);
			const seq = seqRow?.seq ?? 1;
			const inverseId = randomUUID();
			const publishedAt = nowIso();
			const previewKey = generatePreviewKey();
			const inverseItems: PublishedReleaseItem[] = [];

			// Header up front so release_items.release_id FK resolves below.
			const inverseName = sourceRow.name
				? `Revert "${sourceRow.name}"`
				: `Revert ${sourceRow.id.slice(0, 8)}`;
			insertReleaseStmt().run(
				inverseId,
				projectId,
				seq,
				inverseName,
				userId,
				publishedAt,
				previewKey
			);

			for (const item of sourceItems) {
				if (item.kind === 'site') {
					const restoreTree = item.priorTree ?? {};
					const target = getPublishedSiteTree(projectId);
					const priorTree = capturePriorTree(target, restoreTree);
					const next = applyRestore(target, restoreTree);
					upsertPublishedSiteStmt().run(projectId, JSON.stringify(next), publishedAt, inverseId);
					const inverse: PublishedReleaseItem = {
						kind: 'site',
						tree: structuredClone(restoreTree),
						priorTree
					};
					inverseItems.push(inverse);
					insertReleaseItemStmt().run(
						inverseId,
						projectId,
						seq,
						'site',
						SITE_SENTINEL,
						SITE_SENTINEL,
						null,
						null,
						serializePriorTree(restoreTree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				} else if (item.kind === 'layout') {
					const restoreTree = item.priorTree ?? {};
					const existing = getPublishedLayoutTreeStmt().get(projectId, item.locale, item.routeId);
					const target = existing ? (parseTree(existing.tree) ?? {}) : {};
					const priorTree = capturePriorTree(target, restoreTree);
					const next = applyRestore(target, restoreTree);
					upsertPublishedLayoutStmt().run(
						projectId,
						item.locale,
						item.routeId,
						JSON.stringify(next),
						publishedAt,
						inverseId
					);
					const inverse: PublishedReleaseItem = {
						kind: 'layout',
						routeId: item.routeId,
						locale: item.locale,
						tree: structuredClone(restoreTree),
						priorTree
					};
					inverseItems.push(inverse);
					insertReleaseItemStmt().run(
						inverseId,
						projectId,
						seq,
						'layout',
						item.routeId,
						item.locale,
						null,
						null,
						serializePriorTree(restoreTree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				} else if (item.kind === 'page-delete') {
					const hash = paramsHash(item.params);
					if (!item.outcome) {
						// Hard delete: source spliced the entry; inverse re-inserts.
						const existing = getPublishedPageRowStmt().get(
							projectId,
							item.locale,
							item.routeId,
							hash
						);
						if (existing) continue;
						const restored = item.priorTree ?? {};
						upsertPublishedPageStmt().run(
							projectId,
							item.locale,
							item.routeId,
							hash,
							JSON.stringify(item.params),
							JSON.stringify(restored),
							null,
							publishedAt,
							inverseId
						);
						const inverse: PublishedReleaseItem = {
							kind: 'page',
							routeId: item.routeId,
							locale: item.locale,
							params: { ...item.params },
							tree: structuredClone(restored),
							priorTree: null
						};
						inverseItems.push(inverse);
						insertReleaseItemStmt().run(
							inverseId,
							projectId,
							seq,
							'page',
							item.routeId,
							item.locale,
							hash,
							JSON.stringify(item.params),
							JSON.stringify(restored),
							null,
							null,
							null,
							publishedAt
						);
					} else {
						// Tombstone delete: restore prior tombstone (or clear).
						const existing = getPublishedPageRowStmt().get(
							projectId,
							item.locale,
							item.routeId,
							hash
						);
						if (!existing) continue;
						const currentTombstone = parseOutcome(existing.tombstone);
						updatePublishedPageTombstoneStmt().run(
							item.priorTombstone ? JSON.stringify(item.priorTombstone) : null,
							publishedAt,
							inverseId,
							projectId,
							item.locale,
							item.routeId,
							hash
						);
						const inverse: PublishedReleaseItem = {
							kind: 'page-delete',
							routeId: item.routeId,
							locale: item.locale,
							params: { ...item.params },
							outcome: item.outcome,
							priorTree: parseTree(existing.tree) ?? {}
						};
						if (item.priorTombstone) inverse.priorTombstone = item.priorTombstone;
						inverseItems.push(inverse);
						insertReleaseItemStmt().run(
							inverseId,
							projectId,
							seq,
							'page-delete',
							item.routeId,
							item.locale,
							hash,
							JSON.stringify(item.params),
							null,
							JSON.stringify(parseTree(existing.tree) ?? {}),
							JSON.stringify(item.outcome),
							item.priorTombstone
								? JSON.stringify(item.priorTombstone)
								: currentTombstone
									? JSON.stringify(currentTombstone)
									: null,
							publishedAt
						);
					}
				} else if (item.priorTree == null) {
					// Source created the page; revert deletes it.
					const hash = paramsHash(item.params);
					const existing = getPublishedPageRowStmt().get(
						projectId,
						item.locale,
						item.routeId,
						hash
					);
					if (!existing) continue;
					const removedTree = parseTree(existing.tree) ?? {};
					deletePublishedPageStmt().run(projectId, item.locale, item.routeId, hash);
					const inverse: PublishedReleaseItem = {
						kind: 'page-delete',
						routeId: item.routeId,
						locale: item.locale,
						params: { ...item.params },
						priorTree: removedTree
					};
					inverseItems.push(inverse);
					insertReleaseItemStmt().run(
						inverseId,
						projectId,
						seq,
						'page-delete',
						item.routeId,
						item.locale,
						hash,
						JSON.stringify(item.params),
						null,
						JSON.stringify(removedTree),
						null,
						null,
						publishedAt
					);
				} else {
					const restoreTree = item.priorTree;
					const hash = paramsHash(item.params);
					const existing = getPublishedPageRowStmt().get(
						projectId,
						item.locale,
						item.routeId,
						hash
					);
					if (!existing) continue;
					const target = parseTree(existing.tree) ?? {};
					const priorTree = capturePriorTree(target, restoreTree);
					const next = applyRestore(target, restoreTree);
					upsertPublishedPageStmt().run(
						projectId,
						item.locale,
						item.routeId,
						hash,
						existing.params,
						JSON.stringify(next),
						existing.tombstone,
						publishedAt,
						inverseId
					);
					const inverse: PublishedReleaseItem = {
						kind: 'page',
						routeId: item.routeId,
						locale: item.locale,
						params: { ...item.params },
						tree: structuredClone(restoreTree),
						priorTree
					};
					inverseItems.push(inverse);
					insertReleaseItemStmt().run(
						inverseId,
						projectId,
						seq,
						'page',
						item.routeId,
						item.locale,
						hash,
						JSON.stringify(item.params),
						serializePriorTree(restoreTree),
						serializePriorTree(priorTree),
						null,
						null,
						publishedAt
					);
				}
			}

			setReleaseRevertedAtStmt().run(publishedAt, releaseId);
			setLastSeqStmt().run(seq, projectId);

			return {
				id: inverseId,
				name: inverseName,
				publishedBy: userId,
				publishedAt,
				preview_key: previewKey,
				items: inverseItems
			};
		});
		return tx();
	};

	// ---------------------------------------------------------------------------
	// Page listings (for the editor admin bar)
	// ---------------------------------------------------------------------------

	const readMetadataBranch = (tree: Tree | undefined): Record<string, unknown> => {
		const m = tree?.metadata;
		return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
	};

	const paramsKey = (params: Record<string, string>): string => {
		const keys = Object.keys(params).sort();
		return keys.map((k) => `${k}=${params[k]}`).join('&');
	};

	/**
	 * Build the editor's per-route page map for one locale: every published page
	 * + every same-locale `page` / `page-delete` item in the user's open release.
	 * `isDraft` flags entries that exist only in the draft; `isDeletePending`
	 * flags published entries with a staged removal. Routes alphabetical, entries
	 * within a route alphabetical by serialized params.
	 */
	const listAllPages = (projectId: string, userId: string, locale: string): PageMapRoute[] => {
		const map = new Map<string, Map<string, PageMapEntry>>();
		const ensureRoute = (routeId: string): Map<string, PageMapEntry> => {
			let r = map.get(routeId);
			if (!r) {
				r = new Map();
				map.set(routeId, r);
			}
			return r;
		};

		for (const r of allPagesByLocaleStmt().all(projectId, locale)) {
			const route = ensureRoute(r.route_id);
			const tree = parseTree(r.tree) ?? {};
			const tombstone = parseOutcome(r.tombstone);
			const params = parseParams(r.params);
			const entry: PageMapEntry = {
				params,
				metadata: { ...readMetadataBranch(tree) },
				isDraft: false,
				isDeletePending: false
			};
			if (tombstone?.kind === 'redirect') entry.redirectTo = tombstone.to;
			else if (tombstone?.kind === 'gone') entry.gone = true;
			route.set(paramsKey(params), entry);
		}

		if (userId) {
			const items = listOpenReleaseItemsStmt().all(projectId, userId).map(rowToReleaseItem);
			for (const item of items) {
				if (item.kind === 'layout' || item.kind === 'site') continue;
				if (item.locale !== locale) continue;
				const route = ensureRoute(item.routeId);
				const key = paramsKey(item.params);
				const existing = route.get(key);
				if (item.kind === 'page') {
					const itemMeta = readMetadataBranch(item.tree);
					if (existing) {
						existing.metadata = { ...existing.metadata, ...itemMeta };
						continue;
					}
					route.set(key, {
						params: { ...item.params },
						metadata: { ...itemMeta },
						isDraft: true,
						isDeletePending: false
					});
				} else {
					if (!existing) continue;
					existing.isDeletePending = true;
					if (item.outcome?.kind === 'redirect') {
						existing.redirectTo = item.outcome.to;
						delete existing.gone;
					} else if (item.outcome?.kind === 'gone') {
						existing.gone = true;
						delete existing.redirectTo;
					} else {
						delete existing.redirectTo;
						delete existing.gone;
					}
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

	// ---------------------------------------------------------------------------
	// Media
	// ---------------------------------------------------------------------------

	type MediaRow = {
		id: string;
		filename: string;
		original_name: string;
		mime: string;
		size: number;
		url: string;
		uploaded_at: string;
		uploaded_by: string;
	};

	const insertMediaStmt = () =>
		db.prepare<[string, string, string, string, string, number, string, string, string]>(
			'INSERT INTO media_items (id, project_id, filename, original_name, mime, size, url, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);

	/**
	 * Newest first. The tiebreaker is `rowid`, not `id`: `uploaded_at` has
	 * millisecond resolution and `id` is a random UUID, so several uploads inside
	 * one millisecond used to come back in arbitrary order. `rowid` is insertion
	 * order, which is what "newest first" is supposed to mean.
	 */
	const listMediaStmt = () =>
		db.prepare<[string, number, number], MediaRow>(
			'SELECT id, filename, original_name, mime, size, url, uploaded_at, uploaded_by FROM media_items WHERE project_id = ? ORDER BY uploaded_at DESC, rowid DESC LIMIT ? OFFSET ?'
		);

	const countMediaStmt = () =>
		db.prepare<[string], { count: number }>(
			'SELECT COUNT(*) AS count FROM media_items WHERE project_id = ?'
		);

	const findMediaStmt = () =>
		db.prepare<[string, string], MediaRow>(
			'SELECT id, filename, original_name, mime, size, url, uploaded_at, uploaded_by FROM media_items WHERE project_id = ? AND id = ?'
		);

	const deleteMediaStmt = () =>
		db.prepare<[string, string], MediaRow>(
			'DELETE FROM media_items WHERE project_id = ? AND id = ? RETURNING id, filename, original_name, mime, size, url, uploaded_at, uploaded_by'
		);

	const rowToMedia = (r: MediaRow): MediaItem => ({
		id: r.id,
		filename: r.filename,
		originalName: r.original_name,
		mime: r.mime,
		size: r.size,
		url: r.url,
		uploadedAt: r.uploaded_at,
		uploadedBy: r.uploaded_by
	});

	const createMediaItem = (
		projectId: string,
		input: Omit<MediaItem, 'id' | 'uploadedAt'>
	): MediaItem => {
		const item: MediaItem = {
			id: randomUUID(),
			uploadedAt: nowIso(),
			...input
		};
		insertMediaStmt().run(
			item.id,
			projectId,
			item.filename,
			item.originalName,
			item.mime,
			item.size,
			item.url,
			item.uploadedAt,
			item.uploadedBy
		);
		return item;
	};

	const listMediaItems = (
		projectId: string,
		{ offset = 0, limit = 50 }: ListMediaOptions = {}
	): ListMediaResult => {
		const items = listMediaStmt().all(projectId, limit, offset).map(rowToMedia);
		const total = countMediaStmt().get(projectId)?.count ?? 0;
		return { items, total };
	};

	const findMediaItem = (projectId: string, id: string): MediaItem | null => {
		const row = findMediaStmt().get(projectId, id);
		return row ? rowToMedia(row) : null;
	};

	const deleteMediaItem = (projectId: string, id: string): MediaItem | null => {
		const row = deleteMediaStmt().get(projectId, id);
		return row ? rowToMedia(row) : null;
	};

	// ---------------------------------------------------------------------------
	// Test reset / seed
	// ---------------------------------------------------------------------------

	const truncateProjectStmts = (): Array<(projectId: string) => void> => {
		const tables = [
			'open_release_items',
			'open_releases',
			'release_items',
			'releases',
			'published_pages',
			'published_layouts',
			'published_site',
			'media_items',
			'project_state'
		];
		return tables.map((t) => {
			const stmt = db.prepare(`DELETE FROM ${t} WHERE project_id = ?`);
			return (projectId: string) => {
				stmt.run(projectId);
			};
		});
	};

	let _truncators: Array<(projectId: string) => void> | null = null;

	/** Wipe every CMS table for one project. Used by `__test_reset__`.
	 * Also clears the in-process LRU — without this, the next test's first publish
	 * would re-mint `cms_version=1` and collide with cached entries from the
	 * previous test run (production never resets, so version is monotonic). */
	const __resetProjectForTests = (projectId: string): void => {
		if (!_truncators) _truncators = truncateProjectStmts();
		const tx = db.transaction(() => {
			for (const fn of _truncators!) fn(projectId);
		});
		tx();
	};

	/**
	 * Seed published page/layout content for a project. Bypasses the release
	 * flow — used by tests that want a known fixture without going through
	 * publish. Each call replaces existing rows for the same scope.
	 */
	const seedPublishedDocs = (
		projectId: string,
		layouts: Record<string, Record<string, Tree>>,
		pages: Record<string, Record<string, PageEntry[]>>
	): void => {
		const tx = db.transaction(() => {
			ensureProjectState(projectId);
			const seedReleaseId = `seed-${projectId}`;
			const at = nowIso();
			for (const [locale, byRoute] of Object.entries(layouts)) {
				for (const [routeId, tree] of Object.entries(byRoute)) {
					upsertPublishedLayoutStmt().run(
						projectId,
						locale,
						routeId,
						JSON.stringify(tree),
						at,
						seedReleaseId
					);
				}
			}
			for (const [locale, byRoute] of Object.entries(pages)) {
				for (const [routeId, entries] of Object.entries(byRoute)) {
					for (const entry of entries) {
						const hash = paramsHash(entry.params);
						upsertPublishedPageStmt().run(
							projectId,
							locale,
							routeId,
							hash,
							JSON.stringify(entry.params),
							JSON.stringify(entry.published),
							entry.tombstone ? JSON.stringify(entry.tombstone) : null,
							at,
							seedReleaseId
						);
					}
				}
			}
		});
		tx();
	};

	return {
		__resetProjectForTests,
		addReleaseItems,
		allPageRouteIds,
		buildStateAtRelease,
		createMediaItem,
		createPage,
		deleteMediaItem,
		discardOpenRelease,
		discardReleaseItem,
		findMediaItem,
		findOpenReleaseByPreviewKey,
		findPublishedReleaseByPreviewKey,
		getCmsVersion,
		getOpenRelease,
		getPublishedLayoutTree,
		getPublishedPageEntries,
		getPublishedPageEntry,
		getPublishedSiteTree,
		getReleaseHistory,
		listAllPages,
		listMediaItems,
		listPageParamValues,
		lookupReleaseByPreviewKey,
		publishRelease,
		regeneratePreviewKey,
		regeneratePublishedPreviewKey,
		renamePage,
		revertRelease,
		seedPublishedDocs,
		stagePageDelete
	};
};

export type CmsStore = ReturnType<typeof createStore>;
