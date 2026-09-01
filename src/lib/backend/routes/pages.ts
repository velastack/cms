/**
 * `GET/POST/DELETE /pages` and `POST /pages/rename`.
 *
 * `GET` is the one read whose *body* varies with the caller: an editor sees
 * their own drafts and pending deletes, so authenticated reads bypass the cache
 * entirely while anonymous ones go through it.
 */
import type { PageDeleteOutcome } from '../../core/page-entry.js';
import type { PageMapEntry } from '../../core/wire.js';
import { DEFAULT_LOCALE } from '../store/queries.js';
import {
	badRequest,
	isObjectRecord,
	isStringRecord,
	readJson,
	requireUser,
	type RouteCtx
} from './context.js';

const parseOutcome = (v: unknown): PageDeleteOutcome | undefined | 'invalid' => {
	if (v == null) return undefined;
	if (!isObjectRecord(v)) return 'invalid';
	if (v.kind === 'gone') return { kind: 'gone' };
	if (v.kind === 'redirect') {
		if (typeof v.to !== 'string' || v.to === '') return 'invalid';
		return { kind: 'redirect', to: v.to };
	}
	return 'invalid';
};

/**
 * SvelteKit param segments: `[name]`, `[name=matcher]`, `[...rest]`,
 * `[[optional]]`. Group folders like `(marketing)` use parens, not brackets,
 * and contribute no params.
 */
const ownedParamsFromRouteId = (routeId: string): string[] => {
	const out: string[] = [];
	const re = /\[(\.{3}|\[)?([^\]=]+?)(?:=[^\]]+)?\]?\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(routeId)) !== null) out.push(m[2]);
	return out;
};

const paramsKey = (params: Record<string, string>): string => {
	const keys = Object.keys(params).sort();
	return keys.map((k) => `${k}=${params[k]}`).join('&');
};

/**
 * The page-route list, derived from published rows plus any routeIds the
 * caller's open release references. There is no authoritative route registry —
 * the backend never sees the app's route tree.
 */
const collectPageRoutes = (ctx: RouteCtx, userId: string): string[] => {
	const ids = new Set<string>(ctx.store.allPageRouteIds(ctx.projectId));
	if (userId) {
		const release = ctx.store.getOpenRelease(ctx.projectId, userId);
		if (release) {
			for (const item of release.items) {
				if (item.kind === 'page' || item.kind === 'page-delete') ids.add(item.routeId);
			}
		}
	}
	return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const buildRoutes = (ctx: RouteCtx, userId: string, locale: string) => {
	const fromUser = ctx.store.listAllPages(ctx.projectId, userId, locale);
	const byRouteId = new Map<string, PageMapEntry[]>();
	for (const r of fromUser) byRouteId.set(r.routeId, r.entries);
	return collectPageRoutes(ctx, userId).map((routeId) => ({
		routeId,
		ownedParams: ownedParamsFromRouteId(routeId),
		entries: byRouteId.get(routeId) ?? []
	}));
};

export const getPages = (ctx: RouteCtx): Response => {
	const { event, projectId, store, respond } = ctx;
	const locale = event.url.searchParams.get('locale') ?? DEFAULT_LOCALE;
	const versionKey = event.url.searchParams.get('version');

	if (versionKey) {
		const release = store.findPublishedReleaseByPreviewKey(projectId, versionKey);
		if (!release) return new Response('release not found', { status: 404 });
		const snap = store.buildStateAtRelease(projectId, release.id);
		if (!snap) return new Response('release not found', { status: 404 });
		const localeBucket = snap.pageSnap[locale] ?? {};
		const routes = Object.keys(localeBucket)
			.sort()
			.map((routeId) => {
				const entries: PageMapEntry[] = (localeBucket[routeId] ?? [])
					.map((e) => {
						const meta = e.published?.metadata;
						const metadata =
							meta && typeof meta === 'object' && !Array.isArray(meta)
								? { ...(meta as Record<string, unknown>) }
								: {};
						const entry: PageMapEntry = {
							params: { ...e.params },
							metadata,
							isDraft: false,
							isDeletePending: false
						};
						if (e.tombstone?.kind === 'redirect') entry.redirectTo = e.tombstone.to;
						else if (e.tombstone?.kind === 'gone') entry.gone = true;
						return entry;
					})
					.sort((a, b) => {
						const ak = paramsKey(a.params);
						const bk = paramsKey(b.params);
						return ak < bk ? -1 : ak > bk ? 1 : 0;
					});
				return { routeId, ownedParams: ownedParamsFromRouteId(routeId), entries };
			});
		return respond.serveImmutableJson(event, { routes });
	}

	const userId = ctx.user?.id ?? '';

	if (!userId) {
		const cacheCheck = respond.tryPublicCache(event, projectId, `pages:${locale}`);
		if (cacheCheck.hit) return cacheCheck.response;
		return respond.servePublicJson(event, projectId, `pages:${locale}`, cacheCheck, {
			routes: buildRoutes(ctx, '', locale)
		});
	}

	return Response.json({ routes: buildRoutes(ctx, userId, locale) });
};

export const postPages = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	if (!isObjectRecord(body)) return badRequest('object body required');

	const { routeId, locale, params, metadata } = body;
	if (typeof routeId !== 'string' || routeId === '') return badRequest('routeId required');
	if (typeof locale !== 'string' || locale === '') return badRequest('locale required');
	if (!isStringRecord(params)) {
		return badRequest('params must be a string-keyed object of strings');
	}
	if (metadata != null && !isObjectRecord(metadata)) {
		return badRequest('metadata must be an object');
	}

	const result = ctx.store.createPage(
		ctx.projectId,
		user.id,
		routeId,
		locale,
		params,
		metadata as Record<string, unknown> | undefined
	);
	if (!result.ok) return Response.json({ error: 'page-exists' }, { status: 409 });
	return Response.json({ ok: true });
};

/**
 * Remove a page from the editor's view. A draft (a page item in the caller's
 * open release with nothing published behind it) is dropped outright — it never
 * reached publish, so no history is kept. A published page is staged instead;
 * the deletion and its history entry happen at publish time.
 */
export const deletePages = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	if (!isObjectRecord(body)) return badRequest('object body required');

	const { routeId, locale, params, outcome: rawOutcome } = body;
	if (typeof routeId !== 'string' || routeId === '') return badRequest('routeId required');
	if (typeof locale !== 'string' || locale === '') return badRequest('locale required');
	if (!isStringRecord(params)) {
		return badRequest('params must be a string-keyed object of strings');
	}
	const outcome = parseOutcome(rawOutcome);
	if (outcome === 'invalid') {
		return badRequest('outcome must be { kind: "gone" } or { kind: "redirect", to: string }');
	}

	const draftRemoved = ctx.store.discardReleaseItem(ctx.projectId, user.id, {
		kind: 'page',
		routeId,
		locale,
		params
	});
	if (draftRemoved) return Response.json({ ok: true, mode: 'draft-discarded' });

	const staged = ctx.store.stagePageDelete(
		ctx.projectId,
		user.id,
		routeId,
		locale,
		params,
		outcome
	);
	if (!staged.ok) {
		if (staged.reason === 'not-published') return new Response(null, { status: 404 });
		return Response.json({ error: staged.reason }, { status: 409 });
	}
	return Response.json({ ok: true, mode: 'delete-staged' });
};

/**
 * Change a page's params — a slug rename.
 *
 * The admin bar has called this since it shipped; there was never a handler
 * behind it, so renaming silently failed. `toUrl` is the resolved path for the
 * new params, used as the redirect target so the old URL keeps working once the
 * release is published.
 */
export const postPagesRename = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	if (!isObjectRecord(body)) return badRequest('object body required');

	const { routeId, fromParams, toParams, locale, toUrl } = body;
	if (typeof routeId !== 'string' || routeId === '') return badRequest('routeId required');
	if (typeof locale !== 'string' || locale === '') return badRequest('locale required');
	if (!isStringRecord(fromParams)) return badRequest('fromParams must be a string-keyed object');
	if (!isStringRecord(toParams)) return badRequest('toParams must be a string-keyed object');
	if (typeof toUrl !== 'string' || toUrl === '') return badRequest('toUrl required');

	const result = ctx.store.renamePage(ctx.projectId, user.id, {
		routeId,
		locale,
		fromParams,
		toParams,
		toUrl
	});
	if (!result.ok) {
		if (result.reason === 'not-found') return new Response(null, { status: 404 });
		if (result.reason === 'same-params') return badRequest('toParams matches fromParams');
		return Response.json({ error: 'page-exists' }, { status: 409 });
	}
	return Response.json({ release: result.release });
};
