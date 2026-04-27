import type { RequestHandler } from '@sveltejs/kit';
import { listPageVersions, publishVersion, revertToVersion } from '../_store.js';

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

const isParamsObject = (v: unknown): v is Record<string, string> => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
	for (const val of Object.values(v as Record<string, unknown>)) {
		if (typeof val !== 'string') return false;
	}
	return true;
};

// MOCK ONLY — cookie gate stands in for real auth.
export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });
	const routeId = url.searchParams.get('routeId');
	if (!routeId) return new Response('routeId required', { status: 400 });
	const params = parseParams(url.searchParams.get('params'));
	if (!params) return new Response('params must be a JSON object of strings', { status: 400 });
	return Response.json({ versions: listPageVersions(routeId, params) });
};

// MOCK ONLY — accepts { action: 'publish' | 'revert', routeId, params, version }.
// `publish` flips a draft to published in place. `revert` clones the source
// version's contents into a new draft (next version number, fresh preview_key).
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('invalid JSON', { status: 400 });
	}
	if (!body || typeof body !== 'object') return new Response('invalid body', { status: 400 });
	const { action, routeId, params, version } = body as Record<string, unknown>;
	if (action !== 'publish' && action !== 'revert') {
		return new Response('action must be "publish" or "revert"', { status: 400 });
	}
	if (typeof routeId !== 'string' || routeId === '') {
		return new Response('routeId required', { status: 400 });
	}
	if (!isParamsObject(params)) {
		return new Response('params must be an object of strings', { status: 400 });
	}
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return new Response('version must be a positive integer', { status: 400 });
	}
	const result =
		action === 'publish'
			? publishVersion(routeId, params, version)
			: revertToVersion(routeId, params, version);
	if (!result) return new Response('version not found', { status: 404 });
	return Response.json({ version: result });
};
