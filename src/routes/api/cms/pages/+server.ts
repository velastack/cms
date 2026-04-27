import type { RequestHandler } from '@sveltejs/kit';
import { cmsManifest } from 'virtual:vela-cms/manifest';
import type { CmsManifest } from '$lib/components/cms/scope.js';
import {
	createPage,
	discardReleaseItem,
	listAllPages,
	stagePageDelete,
	type PageMapEntry
} from '../_store.js';

const manifest = cmsManifest as CmsManifest;

const isStringRecord = (v: unknown): v is Record<string, string> => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
	for (const val of Object.values(v as Record<string, unknown>)) {
		if (typeof val !== 'string') return false;
	}
	return true;
};

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

type PageRouteFromManifest = { routeId: string; ownedParams: string[] };

/**
 * Walk the build-time manifest for every route whose scope chain contains a
 * `kind: 'page'` leaf. Each route's `ownedParams` come from that page scope,
 * so the client knows whether the route is parameterized without a separate
 * lookup.
 */
const pageRoutesFromManifest = (): PageRouteFromManifest[] => {
	const out: PageRouteFromManifest[] = [];
	for (const [routeId, route] of Object.entries(manifest.routes)) {
		const pageScope = route.scopes.find((s) => s.kind === 'page');
		if (!pageScope) continue;
		out.push({ routeId, ownedParams: pageScope.ownedParams });
	}
	out.sort((a, b) => (a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0));
	return out;
};

// MOCK ONLY — cookie value stands in for a real userId.
export const GET: RequestHandler = async ({ cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });

	const fromUser = listAllPages(userId);
	const byRouteId = new Map<string, PageMapEntry[]>();
	for (const r of fromUser) byRouteId.set(r.routeId, r.entries);

	const routes = pageRoutesFromManifest().map((r) => ({
		routeId: r.routeId,
		ownedParams: r.ownedParams,
		entries: byRouteId.get(r.routeId) ?? []
	}));

	return Response.json({ routes });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('invalid json', { status: 400 });
	}
	if (!isObjectRecord(body)) return new Response('object body required', { status: 400 });

	const { routeId, params, metadata } = body as {
		routeId?: unknown;
		params?: unknown;
		metadata?: unknown;
	};
	if (typeof routeId !== 'string' || routeId === '') {
		return new Response('routeId required', { status: 400 });
	}
	if (!isStringRecord(params)) {
		return new Response('params must be a string-keyed object of strings', { status: 400 });
	}
	if (metadata != null && !isObjectRecord(metadata)) {
		return new Response('metadata must be an object', { status: 400 });
	}

	const result = createPage(
		userId,
		routeId,
		params,
		metadata as Record<string, unknown> | undefined
	);
	if (!result.ok) {
		return Response.json({ error: 'page-exists' }, { status: 409 });
	}
	return Response.json({ ok: true });
};

/**
 * Remove a page from the editor's view. Drafts (page items in the user's
 * open release with no published entry yet) are dropped via
 * `discardReleaseItem` — they never reached publish so no history is kept.
 * Published pages are staged via `stagePageDelete`; the actual `pageDocs`
 * splice and history entry happen at publish time.
 */
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('invalid json', { status: 400 });
	}
	if (!isObjectRecord(body)) return new Response('object body required', { status: 400 });

	const { routeId, params } = body as { routeId?: unknown; params?: unknown };
	if (typeof routeId !== 'string' || routeId === '') {
		return new Response('routeId required', { status: 400 });
	}
	if (!isStringRecord(params)) {
		return new Response('params must be a string-keyed object of strings', { status: 400 });
	}

	const draftRemoved = discardReleaseItem(userId, { kind: 'page', routeId, params });
	if (draftRemoved) {
		return Response.json({ ok: true, mode: 'draft-discarded' });
	}

	const staged = stagePageDelete(userId, routeId, params);
	if (!staged.ok) {
		if (staged.reason === 'not-published') return new Response(null, { status: 404 });
		return Response.json({ error: staged.reason }, { status: 409 });
	}
	return Response.json({ ok: true, mode: 'delete-staged' });
};
