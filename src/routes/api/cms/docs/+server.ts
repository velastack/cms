import type { RequestHandler } from '@sveltejs/kit';
import { findPageEntry } from '$lib/server/mock-adapter.js';
import { pageDocs, saveDrafts, type DraftEntry, type PageSaveTarget } from '../_store.js';

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

const parseVersion = (raw: string | null): number | null => {
	if (raw == null || raw === '') return null;
	const n = Number(raw);
	return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
};

// Public — preview_key is the access token (latest published needs no key).
// Used by the admin bar to overlay alternate versions client-side without a
// full SSR navigation.
export const GET: RequestHandler = async ({ url }) => {
	const routeId = url.searchParams.get('routeId');
	if (!routeId) return new Response('routeId required', { status: 400 });
	const params = parseParams(url.searchParams.get('params'));
	if (!params) return new Response('params must be a JSON object of strings', { status: 400 });
	const version = parseVersion(url.searchParams.get('version'));
	if (version == null) return new Response('version required', { status: 400 });
	const previewKey = url.searchParams.get('preview');

	const entry = findPageEntry(pageDocs[routeId], params);
	if (!entry) return new Response(null, { status: 404 });
	const target = entry.versions.find((v) => v.version === version);
	if (!target) return new Response(null, { status: 404 });

	let latestPublished: (typeof entry.versions)[number] | undefined;
	for (const v of entry.versions) {
		if (v.status !== 'published') continue;
		if (!latestPublished || v.version > latestPublished.version) latestPublished = v;
	}
	const isLatestPublished = !!latestPublished && target.version === latestPublished.version;
	if (!isLatestPublished && (!previewKey || previewKey !== target.preview_key)) {
		return new Response(null, { status: 404 });
	}

	return Response.json({
		version: target.version,
		status: target.status,
		contents: target.contents
	});
};

// MOCK ONLY — cookie gate stands in for real auth.
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });
	const {
		drafts = [],
		metadata = [],
		page = null
	}: {
		drafts?: DraftEntry[];
		metadata?: DraftEntry[];
		page?: PageSaveTarget | null;
	} = await request.json();
	const result = saveDrafts(drafts, metadata, page);
	return Response.json({ ok: true, ...result });
};
