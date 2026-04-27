import type { RequestHandler } from '@sveltejs/kit';
import { createPage } from '../_store.js';

const isStringRecord = (v: unknown): v is Record<string, string> => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
	for (const val of Object.values(v as Record<string, unknown>)) {
		if (typeof val !== 'string') return false;
	}
	return true;
};

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

// MOCK ONLY — cookie gate stands in for real auth (matches docs/+server.ts).
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });

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

	const result = createPage(routeId, params, metadata as Record<string, unknown> | undefined);
	if (!result.ok) {
		return Response.json({ error: 'page-exists' }, { status: 409 });
	}
	return Response.json({ version: result.version, preview_key: result.preview_key });
};
