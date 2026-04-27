import type { RequestHandler } from '@sveltejs/kit';
import { findPageEntry } from '$lib/server/mock-adapter.js';
import {
	findOpenReleaseByPreviewKey,
	layoutDocs,
	pageDocs
} from '../_store.js';

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

const mergeFields = (
	base: Record<string, unknown>,
	overlay: Record<string, unknown>
): Record<string, unknown> => {
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(overlay)) {
		if (k === '_metadata' && v && typeof v === 'object' && !Array.isArray(v)) {
			const existing = (out._metadata as Record<string, unknown>) ?? {};
			out._metadata = { ...existing, ...(v as Record<string, unknown>) };
		} else {
			out[k] = v;
		}
	}
	return out;
};

/**
 * Fetch the resolved content for a single scope. Used by the admin bar to
 * refetch after a save (overlay refresh).
 *
 * Required: `kind` (`page` | `layout`), `routeId`. For pages, also `params`
 * (a JSON object of strings; defaults to `{}`).
 *
 * Optional: `preview=<release-preview-key>` overlays the matching open
 * release's pending edits onto the published content for the requested
 * scope. Without a preview key, only published content is returned.
 */
export const GET: RequestHandler = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	if (kind !== 'page' && kind !== 'layout') {
		return new Response('kind must be "page" or "layout"', { status: 400 });
	}
	const routeId = url.searchParams.get('routeId');
	if (!routeId) return new Response('routeId required', { status: 400 });
	const params = parseParams(url.searchParams.get('params'));
	if (!params) return new Response('params must be a JSON object of strings', { status: 400 });
	const previewKey = url.searchParams.get('preview');

	let base: Record<string, unknown> | undefined;
	if (kind === 'page') {
		base = findPageEntry(pageDocs[routeId], params)?.published;
	} else {
		base = layoutDocs[routeId];
	}

	let contents: Record<string, unknown> | null = base ? { ...base } : null;

	if (previewKey) {
		const release = findOpenReleaseByPreviewKey(previewKey);
		if (release) {
			for (const item of release.items) {
				if (item.kind !== kind || item.routeId !== routeId) continue;
				if (kind === 'page' && item.kind === 'page' && !paramsEqual(item.params, params)) continue;
				contents = mergeFields(contents ?? {}, item.fields);
			}
		}
	}

	if (!contents) return new Response(null, { status: 404 });
	return Response.json({ contents });
};
