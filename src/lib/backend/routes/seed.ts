/**
 * `POST /seed` and `GET /export` — a project's published content as one
 * object (`CmsSeed`).
 *
 * Seeding is how a freshly created project opens with real content instead of
 * a blank site: the host reads the template's published `content/` and posts
 * it here (or calls `store.seed` in-process) right after creating the project.
 * It refuses with 409 when the project already has published rows unless
 * `force` is set, so it can never silently overwrite edits. Image values are
 * seeded as they come — URLs — nothing is uploaded to the media library.
 *
 * Both routes are `required`: a host that seeds over HTTP does so with an
 * editor session, and in-process callers bypass the router entirely.
 */
import type { PageEntry } from '../../core/page-entry.js';
import type { Tree } from '../../core/path.js';
import type { CmsSeed } from '../../core/wire.js';
import { badRequest, isObjectRecord, isStringRecord, readJson, type RouteCtx } from './context.js';

const parseEntries = (raw: unknown[]): PageEntry[] | string => {
	const out: PageEntry[] = [];
	for (const e of raw) {
		if (!isObjectRecord(e)) return 'page entries must be objects';
		if (!isStringRecord(e.params)) return 'page entry params must be a string-keyed object';
		if (!isObjectRecord(e.published)) return 'page entry published must be an object';
		const entry: PageEntry = { params: e.params, published: e.published as Tree };
		const t = e.tombstone as { kind?: unknown; to?: unknown } | undefined;
		if (isObjectRecord(t)) {
			if (t.kind === 'gone') entry.tombstone = { kind: 'gone' };
			else if (t.kind === 'redirect' && typeof t.to === 'string') {
				entry.tombstone = { kind: 'redirect', to: t.to };
			} else return 'page entry tombstone must be gone or redirect';
		}
		out.push(entry);
	}
	return out;
};

/** Validate a request body into a {@link CmsSeed}, or explain why not. */
export const parseSeed = (body: unknown): CmsSeed | string => {
	if (!isObjectRecord(body)) return 'object body required';
	const seed: CmsSeed = {};

	if (body.layouts !== undefined) {
		if (!isObjectRecord(body.layouts)) return 'layouts must be keyed by locale';
		seed.layouts = {};
		for (const [locale, byRoute] of Object.entries(body.layouts)) {
			if (!isObjectRecord(byRoute)) return `layouts.${locale} must be keyed by route id`;
			const bucket: Record<string, Tree> = {};
			for (const [routeId, tree] of Object.entries(byRoute)) {
				if (!routeId.startsWith('/')) return `layouts.${locale}: "${routeId}" is not a route id`;
				if (!isObjectRecord(tree)) return `layouts.${locale}.${routeId} must be an object`;
				bucket[routeId] = tree as Tree;
			}
			seed.layouts[locale] = bucket;
		}
	}

	if (body.pages !== undefined) {
		if (!isObjectRecord(body.pages)) return 'pages must be keyed by locale';
		seed.pages = {};
		for (const [locale, byRoute] of Object.entries(body.pages)) {
			if (!isObjectRecord(byRoute)) return `pages.${locale} must be keyed by route id`;
			const bucket: Record<string, Tree | PageEntry[]> = {};
			for (const [routeId, value] of Object.entries(byRoute)) {
				if (!routeId.startsWith('/')) return `pages.${locale}: "${routeId}" is not a route id`;
				if (Array.isArray(value)) {
					const entries = parseEntries(value);
					if (typeof entries === 'string') return `pages.${locale}.${routeId}: ${entries}`;
					bucket[routeId] = entries;
				} else if (isObjectRecord(value)) {
					bucket[routeId] = value as Tree;
				} else return `pages.${locale}.${routeId} must be an object or an entry list`;
			}
			seed.pages[locale] = bucket;
		}
	}

	if (body.site !== undefined) {
		if (!isObjectRecord(body.site)) return 'site must be an object';
		seed.site = body.site as Tree;
	}

	return seed;
};

export const postSeed = async (ctx: RouteCtx): Promise<Response> => {
	const body = await readJson(ctx.event);
	if (body === undefined) return badRequest('invalid json');
	const seed = parseSeed(body);
	if (typeof seed === 'string') return badRequest(seed);
	const force = isObjectRecord(body) && body.force === true;

	const result = ctx.store.seed(ctx.projectId, seed, { force });
	if (!result.ok) return Response.json(result, { status: 409 });
	ctx.cache.clear();
	return Response.json(result);
};

export const getExport = (ctx: RouteCtx): Response =>
	Response.json(ctx.store.exportPublished(ctx.projectId));
