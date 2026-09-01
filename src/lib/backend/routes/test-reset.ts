/**
 * `POST /__test_reset__` — wipe one project's CMS data and optionally seed it.
 *
 * Off unless the host sets `testReset`. It exists so an integration suite (or a
 * developer poking at `vela dev`) can stand up a known fixture in one
 * round-trip; the in-process test client calls the same code path through
 * `backend.testing.reset`, which keeps the two honest.
 *
 * One deliberate change from the original: that version did
 * `rm(uploadDir(), { recursive: true, force: true })` — a recursive delete of a
 * host-configured directory, on an unauthenticated POST. Here only files whose
 * names this backend could have generated are unlinked, and never the directory
 * itself, so a misconfigured `uploadDir` cannot be destroyed.
 */
import { readdir, unlink } from 'node:fs/promises';
import type { PageEntry } from '../../core/page-entry.js';
import type { Tree } from '../../core/path.js';
import { DEFAULT_LOCALE } from '../store/queries.js';
import { isSafeUploadFilename } from '../storage.js';
import { badRequest, isObjectRecord, readJson, type RouteCtx } from './context.js';

export type SeedInput = {
	layoutDocs?: Record<string, unknown>;
	pageDocs?: Record<string, unknown>;
};

/**
 * Two accepted seed shapes, told apart by inspecting the first level:
 * flat (`{ '/': {...} }`, nested under the default locale) or per-locale
 * (`{ en: { '/': {...} } }`).
 */
const isLayoutFlatShape = (m: Record<string, unknown>): boolean => {
	for (const v of Object.values(m)) {
		if (!isObjectRecord(v)) return true;
		const keys = Object.keys(v);
		if (keys.length === 0) return true;
		if (!keys.every((k) => k.startsWith('/'))) return true;
	}
	return false;
};

const isPagesFlatShape = (m: Record<string, unknown>): boolean => {
	for (const v of Object.values(m)) {
		if (Array.isArray(v)) return true;
	}
	return false;
};

/** Normalise either seed shape into `[locale][routeId]` buckets. */
export const normalizeSeed = (seed: SeedInput) => {
	const layouts: Record<string, Record<string, Tree>> = {};
	const pages: Record<string, Record<string, PageEntry[]>> = {};

	if (isObjectRecord(seed.layoutDocs)) {
		if (isLayoutFlatShape(seed.layoutDocs)) {
			const bucket = (layouts[DEFAULT_LOCALE] ??= {});
			for (const [k, v] of Object.entries(seed.layoutDocs)) {
				if (isObjectRecord(v)) bucket[k] = v as Tree;
			}
		} else {
			for (const [locale, byRoute] of Object.entries(seed.layoutDocs)) {
				if (!isObjectRecord(byRoute)) continue;
				const bucket = (layouts[locale] ??= {});
				for (const [k, v] of Object.entries(byRoute)) {
					if (isObjectRecord(v)) bucket[k] = v as Tree;
				}
			}
		}
	}

	if (isObjectRecord(seed.pageDocs)) {
		if (isPagesFlatShape(seed.pageDocs)) {
			const bucket = (pages[DEFAULT_LOCALE] ??= {});
			for (const [k, v] of Object.entries(seed.pageDocs)) {
				if (Array.isArray(v)) bucket[k] = v as PageEntry[];
			}
		} else {
			for (const [locale, byRoute] of Object.entries(seed.pageDocs)) {
				if (!isObjectRecord(byRoute)) continue;
				const bucket = (pages[locale] ??= {});
				for (const [k, v] of Object.entries(byRoute)) {
					if (Array.isArray(v)) bucket[k] = v as PageEntry[];
				}
			}
		}
	}

	return { layouts, pages };
};

/** Remove only files this backend could have written. */
export const clearUploads = async (uploadDir: string): Promise<void> => {
	let names: string[];
	try {
		names = await readdir(uploadDir);
	} catch {
		return;
	}
	await Promise.all(
		names.filter(isSafeUploadFilename).map((n) => unlink(`${uploadDir}/${n}`).catch(() => {}))
	);
};

export const postTestReset = async (ctx: RouteCtx): Promise<Response> => {
	const body = await readJson(ctx.event);
	if (body !== undefined && !isObjectRecord(body)) return badRequest('invalid json');

	ctx.store.__resetProjectForTests(ctx.projectId);
	ctx.cache.clear();
	await clearUploads(ctx.storage.dir());

	const { layouts, pages } = normalizeSeed((body ?? {}) as SeedInput);
	if (Object.keys(layouts).length > 0 || Object.keys(pages).length > 0) {
		ctx.store.seedPublishedDocs(ctx.projectId, layouts, pages);
	}

	return new Response(null, { status: 204 });
};
