/**
 * `GET /docs` — the hot read path.
 *
 * Ported from the original route handler with its three modes and their cache
 * semantics unchanged: `?version=` reads an immutable release snapshot,
 * `?preview=` overlays the caller's open release and bypasses every cache
 * layer, and a plain read goes through the per-project LRU with an ETag keyed
 * on `cms_version`. `?version` wins when both are present, by branch order.
 */
import { mergeTree, type Tree } from '../../core/path.js';
import { findPageEntry, type PageDeleteOutcome } from '../../core/page-entry.js';
import { DEFAULT_LOCALE } from '../store/queries.js';
import { badRequest, type RouteCtx } from './context.js';

const parseParams = (raw: string | null): Record<string, string> | null => {
	if (raw == null || raw === '') return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof v !== 'string') return null;
			out[k] = v;
		}
		return out;
	} catch {
		return null;
	}
};

const paramsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
	const aKeys = Object.keys(a);
	if (aKeys.length !== Object.keys(b).length) return false;
	for (const k of aKeys) if (a[k] !== b[k]) return false;
	return true;
};

/** Stable cache scope key for one /docs request. Mirrors the params hash shape
 * from the store so the LRU partitions cleanly per scope. */
const cacheScope = (
	kind: 'page' | 'layout',
	locale: string,
	routeId: string,
	params: Record<string, string>
): string => {
	if (kind === 'layout') return `docs:layout:${locale}:${routeId}`;
	const keys = Object.keys(params).sort();
	const sorted: Record<string, string> = {};
	for (const k of keys) sorted[k] = params[k];
	return `docs:page:${locale}:${routeId}:${JSON.stringify(sorted)}`;
};

export const getDocs = (ctx: RouteCtx): Response => {
	const { event, projectId, store, respond } = ctx;
	const url = event.url;

	const kind = url.searchParams.get('kind');
	if (kind !== 'page' && kind !== 'layout') {
		return badRequest('kind must be "page" or "layout"');
	}
	const routeId = url.searchParams.get('routeId');
	if (!routeId) return badRequest('routeId required');
	const params = parseParams(url.searchParams.get('params'));
	if (!params) return badRequest('params must be a JSON object of strings');
	const locale = url.searchParams.get('locale') ?? DEFAULT_LOCALE;
	const previewKey = url.searchParams.get('preview');
	const versionKey = url.searchParams.get('version');

	if (versionKey) {
		const release = store.findPublishedReleaseByPreviewKey(projectId, versionKey);
		if (!release) return new Response('release not found', { status: 404 });
		const snap = store.buildStateAtRelease(projectId, release.id);
		if (!snap) return new Response('release not found', { status: 404 });
		if (kind === 'page') {
			const entry = findPageEntry(snap.pageSnap[locale]?.[routeId], params);
			if (entry?.tombstone) return respond.serveImmutableJson(event, entry.tombstone);
			const contents = entry?.published ?? null;
			if (!contents) return respond.serveImmutableNotFound(event);
			return respond.serveImmutableJson(event, { contents });
		}
		const contents = snap.layoutSnap[locale]?.[routeId] ?? null;
		if (!contents) return respond.serveImmutableNotFound(event);
		return respond.serveImmutableJson(event, { contents });
	}

	// Preview path: editor-only, low volume, bypass all cache layers.
	if (previewKey) {
		const base =
			kind === 'page' ? store.getPublishedPageEntry(projectId, locale, routeId, params) : null;
		const layoutBase =
			kind === 'layout' ? store.getPublishedLayoutTree(projectId, locale, routeId) : null;
		const release = store.findOpenReleaseByPreviewKey(projectId, previewKey);
		if (release) {
			if (kind === 'page') {
				const pageDelete = release.items.find(
					(i) =>
						i.kind === 'page-delete' &&
						i.routeId === routeId &&
						i.locale === locale &&
						paramsEqual(i.params, params)
				);
				if (pageDelete && pageDelete.kind === 'page-delete') {
					if (pageDelete.outcome) return Response.json(pageDelete.outcome);
					return new Response(null, { status: 404 });
				}
			}
			let contents: Tree | null = base?.published
				? { ...base.published }
				: layoutBase
					? { ...layoutBase }
					: null;
			for (const item of release.items) {
				if (item.kind !== kind || item.routeId !== routeId) continue;
				if (item.locale !== locale) continue;
				if (kind === 'page' && item.kind === 'page' && !paramsEqual(item.params, params)) continue;
				contents = mergeTree(contents ?? {}, item.tree);
			}
			if (!contents) {
				if (base?.tombstone) return Response.json(base.tombstone);
				return new Response(null, { status: 404 });
			}
			return Response.json({ contents });
		}
		// Preview key didn't match — fall through to the public path so we
		// still serve published content (and apply caching).
	}

	const scope = cacheScope(kind, locale, routeId, params);
	const cacheCheck = respond.tryPublicCache(event, projectId, scope);
	if (cacheCheck.hit) return cacheCheck.response;

	let base: Tree | undefined;
	let baseTombstone: PageDeleteOutcome | undefined;
	if (kind === 'page') {
		const entry = store.getPublishedPageEntry(projectId, locale, routeId, params);
		base = entry?.published;
		baseTombstone = entry?.tombstone;
	} else {
		base = store.getPublishedLayoutTree(projectId, locale, routeId) ?? undefined;
	}

	if (baseTombstone)
		return respond.servePublicJson(event, projectId, scope, cacheCheck, baseTombstone);
	if (!base) return respond.servePublicNotFound(event, cacheCheck);
	return respond.servePublicJson(event, projectId, scope, cacheCheck, { contents: base });
};
