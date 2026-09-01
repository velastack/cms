/**
 * The release endpoints: the caller's open draft, the items in it, and the
 * published history.
 *
 * Every route here is `required` in the table, so `requireUser` never throws —
 * the router has already returned 403 for anonymous and cross-project callers.
 */
import type { AddReleaseItemInput, DiscardItemTarget } from '../../core/wire.js';
import {
	badRequest,
	isObjectRecord,
	isStringRecord,
	readJson,
	requireUser,
	type RouteCtx
} from './context.js';

const parseItems = (raw: unknown): AddReleaseItemInput[] | string => {
	if (!Array.isArray(raw)) return 'items must be an array';
	const out: AddReleaseItemInput[] = [];
	for (const r of raw) {
		if (!isObjectRecord(r)) return 'each item must be an object';
		const { kind, routeId, locale, params, tree } = r;
		if (kind !== 'page' && kind !== 'layout' && kind !== 'site') {
			return 'item.kind must be "page", "layout", or "site"';
		}
		if (!isObjectRecord(tree)) return 'item.tree must be an object';
		if (kind === 'site') {
			out.push({ kind: 'site', tree });
			continue;
		}
		if (typeof routeId !== 'string' || routeId === '') return 'item.routeId required';
		if (typeof locale !== 'string' || locale === '') return 'item.locale required';
		if (kind === 'page') {
			if (!isStringRecord(params)) return 'page item.params must be a string-keyed object';
			out.push({ kind: 'page', routeId, locale, params, tree });
		} else {
			out.push({ kind: 'layout', routeId, locale, tree });
		}
	}
	return out;
};

const parseTarget = (raw: unknown): DiscardItemTarget | string => {
	if (!isObjectRecord(raw)) return 'object body required';
	const { kind, routeId, locale, params } = raw;
	if (kind === 'site') return { kind: 'site' };
	if (kind !== 'page' && kind !== 'layout' && kind !== 'page-delete') {
		return 'kind must be "page", "layout", "page-delete", or "site"';
	}
	if (typeof routeId !== 'string' || routeId === '') return 'routeId required';
	if (typeof locale !== 'string' || locale === '') return 'locale required';
	if (kind === 'layout') return { kind: 'layout', routeId, locale };
	if (!isStringRecord(params)) return `${kind} params must be a string-keyed object`;
	return { kind, routeId, locale, params };
};

export const getRelease = (ctx: RouteCtx): Response => {
	const user = requireUser(ctx);
	const release = ctx.store.getOpenRelease(ctx.projectId, user.id);
	return Response.json({ release: release ?? null });
};

export const postReleaseItems = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	if (!isObjectRecord(body)) return badRequest('object body required');

	const items = parseItems(body.items);
	if (typeof items === 'string') return badRequest(items);

	const release = ctx.store.addReleaseItems(ctx.projectId, user.id, items);
	return Response.json({ release });
};

export const deleteReleaseItems = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	const target = parseTarget(body);
	if (typeof target === 'string') return badRequest(target);
	const ok = ctx.store.discardReleaseItem(ctx.projectId, user.id, target);
	if (!ok) return new Response(null, { status: 404 });
	return Response.json({ ok: true });
};

export const postReleasePublish = async (ctx: RouteCtx): Promise<Response> => {
	const user = requireUser(ctx);
	let name: string | undefined;

	const text = await ctx.event.request.text();
	if (text) {
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return badRequest('invalid json');
		}
		if (!isObjectRecord(body)) return badRequest('object body required');
		if (body.name != null) {
			if (typeof body.name !== 'string') return badRequest('name must be a string');
			name = body.name;
		}
	}

	const published = ctx.store.publishRelease(ctx.projectId, user.id, name);
	if (!published) return new Response('no open release to publish', { status: 404 });
	return Response.json({ release: published });
};

export const postReleaseDiscard = (ctx: RouteCtx): Response => {
	const user = requireUser(ctx);
	return Response.json({ ok: ctx.store.discardOpenRelease(ctx.projectId, user.id) });
};

export const postReleasePreviewKey = (ctx: RouteCtx): Response => {
	const user = requireUser(ctx);
	const key = ctx.store.regeneratePreviewKey(ctx.projectId, user.id);
	if (!key) return new Response('no open release', { status: 404 });
	return Response.json({ preview_key: key });
};

export const getReleaseHistory = (ctx: RouteCtx): Response => {
	requireUser(ctx);
	const history = ctx.store
		.getReleaseHistory(ctx.projectId)
		.slice()
		.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
	return Response.json({ history });
};

export const postReleaseRevert = (ctx: RouteCtx): Response => {
	const user = requireUser(ctx);
	const id = ctx.params.id;
	if (!id) return badRequest('id required');
	const reverted = ctx.store.revertRelease(ctx.projectId, id, user.id);
	if (!reverted) return new Response('release not found', { status: 404 });
	return Response.json({ release: reverted });
};

export const postReleaseHistoryPreviewKey = (ctx: RouteCtx): Response => {
	requireUser(ctx);
	const id = ctx.params.id;
	if (!id) return badRequest('release id required');
	const key = ctx.store.regeneratePublishedPreviewKey(ctx.projectId, id);
	if (!key) return new Response('release not found', { status: 404 });
	return Response.json({ preview_key: key });
};
