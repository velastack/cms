import type { RequestHandler } from '@sveltejs/kit';
import {
	addReleaseItems,
	discardReleaseItem,
	type AddReleaseItemInput,
	type DiscardItemTarget
} from '../../_store.js';

const isStringRecord = (v: unknown): v is Record<string, string> => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
	for (const val of Object.values(v as Record<string, unknown>)) {
		if (typeof val !== 'string') return false;
	}
	return true;
};

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

const parseItems = (raw: unknown): AddReleaseItemInput[] | string => {
	if (!Array.isArray(raw)) return 'items must be an array';
	const out: AddReleaseItemInput[] = [];
	for (const r of raw) {
		if (!isObjectRecord(r)) return 'each item must be an object';
		const { kind, routeId, params, fields } = r as Record<string, unknown>;
		if (kind !== 'page' && kind !== 'layout') return 'item.kind must be "page" or "layout"';
		if (typeof routeId !== 'string' || routeId === '') return 'item.routeId required';
		if (!isObjectRecord(fields)) return 'item.fields must be an object';
		if (kind === 'page') {
			if (!isStringRecord(params)) return 'page item.params must be a string-keyed object';
			out.push({ kind: 'page', routeId, params, fields });
		} else {
			out.push({ kind: 'layout', routeId, fields });
		}
	}
	return out;
};

const parseTarget = (raw: unknown): DiscardItemTarget | string => {
	if (!isObjectRecord(raw)) return 'object body required';
	const { kind, routeId, params } = raw;
	if (kind !== 'page' && kind !== 'layout' && kind !== 'page-delete') {
		return 'kind must be "page", "layout", or "page-delete"';
	}
	if (typeof routeId !== 'string' || routeId === '') return 'routeId required';
	if (kind === 'layout') return { kind: 'layout', routeId };
	if (!isStringRecord(params)) return `${kind} params must be a string-keyed object`;
	return { kind, routeId, params };
};

// MOCK ONLY — cookie value doubles as the userId.
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

	const items = parseItems(body.items);
	if (typeof items === 'string') return new Response(items, { status: 400 });

	const release = addReleaseItems(userId, items);
	return Response.json({ release });
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('invalid json', { status: 400 });
	}
	const target = parseTarget(body);
	if (typeof target === 'string') return new Response(target, { status: 400 });
	const ok = discardReleaseItem(userId, target);
	if (!ok) return new Response(null, { status: 404 });
	return Response.json({ ok: true });
};
