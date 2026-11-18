/**
 * `GET /site` — project-wide settings (branding, contact, social).
 *
 * One tree per project: no locale, no params. Mirrors `/docs` for the cache,
 * preview, and version contract, and always returns 200 (an unset site is an
 * empty tree, not a 404).
 *
 * A project whose company profile the host manages (`company.resolve`) reads
 * with that profile laid over the stored tree. It can change without a
 * publish, so those responses are never immutable and never come from the
 * read cache.
 */
import { mergeTree, type Tree } from '../../core/path.js';
import { managedCompanyTag, resolveManagedCompany, withManagedCompany } from '../company.js';
import type { RouteCtx } from './context.js';

export const getSite = async (ctx: RouteCtx): Promise<Response> => {
	const { event, projectId, store, respond } = ctx;
	const managed = await resolveManagedCompany(ctx);
	const previewKey = event.url.searchParams.get('preview');
	const versionKey = event.url.searchParams.get('version');

	if (versionKey) {
		const release = store.findPublishedReleaseByPreviewKey(projectId, versionKey);
		if (!release) return new Response('release not found', { status: 404 });
		const snap = store.buildStateAtRelease(projectId, release.id);
		if (!snap) return new Response('release not found', { status: 404 });
		if (managed) return Response.json({ contents: withManagedCompany(snap.siteSnap, managed) });
		return respond.serveImmutableJson(event, { contents: snap.siteSnap });
	}

	if (previewKey) {
		const base = store.getPublishedSiteTree(projectId);
		const release = store.findOpenReleaseByPreviewKey(projectId, previewKey);
		let contents: Tree = { ...base };
		if (release) {
			for (const item of release.items) {
				if (item.kind !== 'site') continue;
				contents = mergeTree(contents, item.tree);
			}
		}
		if (managed) contents = withManagedCompany(contents, managed);
		return Response.json({ contents });
	}

	if (managed) {
		return respond.servePublicTagged(event, projectId, managedCompanyTag(managed), () => ({
			contents: withManagedCompany(store.getPublishedSiteTree(projectId), managed)
		}));
	}

	const cacheCheck = respond.tryPublicCache(event, projectId, 'site');
	if (cacheCheck.hit) return cacheCheck.response;
	const base = store.getPublishedSiteTree(projectId);
	return respond.servePublicJson(event, projectId, 'site', cacheCheck, { contents: base });
};
