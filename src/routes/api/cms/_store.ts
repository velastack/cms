/**
 * Shared in-memory mock store for the test harness.
 *
 * `layoutDocs` holds flat layout documents keyed by `routeId` (header, footer,
 * marketing chrome). `pageDocs` holds versioned page documents keyed by
 * `routeId`, each entry tagged with its `params` (e.g. `{ slug: 'suite-1' }`)
 * and an array of `PageVersion` records (draft/published, with a per-version
 * `preview_key`).
 *
 * Both are the same object references the `mockAdapter` captures from
 * `+layout.server.ts` and that the `/api/cms/*` endpoints read/mutate. Mutate
 * in place — never reassign — or the adapter's captured reference will silently
 * desync.
 *
 * Note: dev-mode HMR re-evaluates this module, which resets the store —
 * including any drafts saved or new versions forked during the session.
 * Acceptable for a mock; would not be acceptable for real persistence.
 */
import { randomBytes } from 'node:crypto';
import {
	findPageEntry,
	type CmsStatus,
	type PageEntry,
	type PageVersion
} from '$lib/server/mock-adapter.js';

export type CmsVersionSummary = {
	version: number;
	status: CmsStatus;
	preview_key: string;
};

export const generatePreviewKey = (): string => randomBytes(8).toString('hex');

const v1 = (contents: Record<string, unknown>): PageVersion => ({
	version: 1,
	status: 'published',
	preview_key: generatePreviewKey(),
	contents
});

const draft = (version: number, contents: Record<string, unknown>): PageVersion => ({
	version,
	status: 'draft',
	preview_key: generatePreviewKey(),
	contents
});

const entry = (params: Record<string, string>, versions: PageVersion[]): PageEntry => ({
	params,
	versions
});

export const layoutDocs: Record<string, Record<string, unknown>> = {
	'/': {
		'footer.links': [
			{ href: '/', label: 'Home' },
			{ href: '/about', label: 'About' },
			{ href: '/dashboard', label: 'Dashboard' }
		]
	},
	'/(marketing)': {
		'header.title': 'VelaStack CMS',
		'announcement.text': 'Spring rates are live — book by April 30.'
	},
	'/(app)': {
		'header.title': 'VelaStack CMS — Admin'
	}
};

export const pageDocs: Record<string, PageEntry[]> = {
	'/': [
		entry({}, [
			v1({
				'welcome.title': 'Velastack CMS test harness',
				'welcome.body':
					'<p>Pick a section: marketing pages live under <a href="/about">/about</a> and <a href="/rooms/suite-1">/rooms/[slug]</a>; the app shell lives under <a href="/dashboard">/dashboard</a>.</p>',
				_metadata: {
					title: 'Home',
					description: 'Velastack CMS test harness — start here.'
				}
			})
		])
	],
	'/(marketing)/about': [
		entry({}, [
			v1({
				'hero.title': 'About VelaStack CMS',
				body: '<p>A zero-config CMS for SvelteKit. This page is rendered through the marketing layout, so its CMS fields live under the <code>page:/(marketing)/about</code> scope.</p>',
				_metadata: {
					title: 'About VelaStack CMS',
					description: 'A zero-config CMS for SvelteKit.'
				}
			}),
			draft(2, {
				'hero.title': 'About VelaStack CMS — draft',
				body: '<p>Draft revision being prepared for the spring relaunch. Same scope as v1, with a tighter intro and a call-out for the new editor flow.</p>',
				_metadata: {
					title: 'About VelaStack CMS (draft)',
					description: 'Spring-relaunch draft.'
				}
			})
		])
	],
	'/(marketing)/rooms/[slug]': [
		entry({ slug: 'suite-1' }, [
			v1({
				'hero.title': 'Suite 1 — Cliffside',
				'hero.image': 'https://placehold.co/960x420?text=Suite+1',
				'gallery.items': [
					{ src: 'https://placehold.co/400x300?text=View+1', caption: 'Morning light' },
					{ src: 'https://placehold.co/400x300?text=View+2', caption: 'Sunset deck' }
				],
				_metadata: {
					title: 'Suite 1 — Cliffside',
					description: 'Cliffside suite with two ocean-view scenes.'
				}
			})
		]),
		entry({ slug: 'suite-2' }, [
			v1({
				'hero.title': 'Suite 2 — Garden',
				'hero.image': 'https://placehold.co/960x420?text=Suite+2',
				'gallery.items': [{ src: 'https://placehold.co/400x300?text=Garden+1', caption: 'Courtyard' }],
				_metadata: {
					title: 'Suite 2 — Garden',
					description: 'Garden suite overlooking the central courtyard.'
				}
			})
		])
	],
	'/(app)/dashboard': [
		entry({}, [
			v1({
				'welcome.title': 'Welcome back',
				body: '<p>Operator dashboard. Same <code>Header.svelte</code>, different scope, different content.</p>',
				_metadata: {
					title: 'Dashboard',
					description: 'Operator dashboard.',
					robots: 'noindex'
				}
			}),
			draft(2, {
				'welcome.title': 'Welcome back, operator',
				body: '<p>Draft of the dashboard intro with revised copy and a new task summary callout.</p>',
				_metadata: {
					title: 'Dashboard (draft)',
					description: 'Operator dashboard — draft.',
					robots: 'noindex'
				}
			})
		])
	]
};

export const listPageVersions = (
	routeId: string,
	params: Record<string, string>
): CmsVersionSummary[] => {
	const e = findPageEntry(pageDocs[routeId], params);
	if (!e) return [];
	return e.versions
		.map((v) => ({ version: v.version, status: v.status, preview_key: v.preview_key }))
		.sort((a, b) => b.version - a.version);
};

/**
 * List the bound values seen in `pageDocs` for one `[param]` of a given route.
 * Used for SvelteKit page-entry generation: given `routeId` like
 * `/(marketing)/rooms/[slug]` and `param: 'slug'`, returns every distinct
 * slug value for which a page document exists.
 */
export const listPageParamValues = (routeId: string, param: string): string[] => {
	const entries = pageDocs[routeId];
	if (!entries) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const e of entries) {
		const v = e.params[param];
		if (typeof v !== 'string' || seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
};

export const publishVersion = (
	routeId: string,
	params: Record<string, string>,
	version: number
): CmsVersionSummary | null => {
	const e = findPageEntry(pageDocs[routeId], params);
	if (!e) return null;
	const v = e.versions.find((x) => x.version === version);
	if (!v) return null;
	if (v.status === 'draft') v.status = 'published';
	return { version: v.version, status: v.status, preview_key: v.preview_key };
};

export const revertToVersion = (
	routeId: string,
	params: Record<string, string>,
	version: number
): CmsVersionSummary | null => {
	const e = findPageEntry(pageDocs[routeId], params);
	if (!e) return null;
	const source = e.versions.find((x) => x.version === version);
	if (!source) return null;
	const nextVersion = e.versions.reduce((max, v) => (v.version > max ? v.version : max), 0) + 1;
	const newRecord: PageVersion = {
		version: nextVersion,
		status: 'draft',
		preview_key: generatePreviewKey(),
		contents: structuredClone(source.contents)
	};
	e.versions.push(newRecord);
	return {
		version: newRecord.version,
		status: newRecord.status,
		preview_key: newRecord.preview_key
	};
};

const findLatestPublished = (versions: PageVersion[]): PageVersion | undefined => {
	let best: PageVersion | undefined;
	for (const v of versions) {
		if (v.status !== 'published') continue;
		if (!best || v.version > best.version) best = v;
	}
	return best;
};

export type DraftEntry = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
	fields: Record<string, unknown>;
};

export type PageSaveTarget = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
	baseVersion: number | null;
};

export type SavedPageVersion = {
	scopeId: string;
	routeId: string;
	params: Record<string, string>;
	version: number;
	preview_key: string;
};

export type SaveDraftsResult = {
	pageVersion?: SavedPageVersion;
};

/**
 * Apply a save batch from the admin bar.
 *
 * Layout entries are mutated in place (no versioning). The page entry — at
 * `page.routeId` + `page.params`, if any — is either updated in place when
 * `page.baseVersion` still points at a draft, or forked into a fresh draft
 * otherwise (next version, new `preview_key`, contents = base contents merged
 * with the incoming drafts and metadata).
 *
 * Status is always re-read from the store, never trusted from the client.
 */
export const saveDrafts = (
	drafts: DraftEntry[],
	metadata: DraftEntry[],
	page: PageSaveTarget | null
): SaveDraftsResult => {
	const result: SaveDraftsResult = {};

	for (const d of drafts) {
		if (!d.scopeId.startsWith('layout:')) continue;
		const target = (layoutDocs[d.routeId] ??= {});
		Object.assign(target, d.fields);
	}
	for (const m of metadata) {
		if (!m.scopeId.startsWith('layout:')) continue;
		const target = (layoutDocs[m.routeId] ??= {});
		const existingMeta = (target._metadata as Record<string, unknown>) ?? {};
		target._metadata = { ...existingMeta, ...m.fields };
	}

	if (!page) return result;

	const matchPageEntry = (e: DraftEntry) =>
		e.scopeId === page.scopeId &&
		e.routeId === page.routeId &&
		paramsEqual(e.params, page.params);

	const pageDrafts = drafts.find(matchPageEntry)?.fields ?? {};
	const pageMeta = metadata.find(matchPageEntry)?.fields ?? {};
	if (Object.keys(pageDrafts).length === 0 && Object.keys(pageMeta).length === 0) {
		return result;
	}

	const entries = (pageDocs[page.routeId] ??= []);
	let pageEntry = findPageEntry(entries, page.params);
	if (!pageEntry) {
		pageEntry = { params: { ...page.params }, versions: [] };
		entries.push(pageEntry);
	}
	const versions = pageEntry.versions;
	const baseRecord =
		page.baseVersion != null ? versions.find((v) => v.version === page.baseVersion) : undefined;

	if (baseRecord && baseRecord.status === 'draft') {
		Object.assign(baseRecord.contents, pageDrafts);
		if (Object.keys(pageMeta).length > 0) {
			const existingMeta = (baseRecord.contents._metadata as Record<string, unknown>) ?? {};
			baseRecord.contents._metadata = { ...existingMeta, ...pageMeta };
		}
		result.pageVersion = {
			scopeId: page.scopeId,
			routeId: page.routeId,
			params: pageEntry.params,
			version: baseRecord.version,
			preview_key: baseRecord.preview_key
		};
		return result;
	}

	const seed = baseRecord ?? findLatestPublished(versions) ?? versions[versions.length - 1];
	const baseContents: Record<string, unknown> = seed ? { ...seed.contents } : {};
	Object.assign(baseContents, pageDrafts);
	if (Object.keys(pageMeta).length > 0) {
		const existingMeta = (baseContents._metadata as Record<string, unknown>) ?? {};
		baseContents._metadata = { ...existingMeta, ...pageMeta };
	}
	const nextVersion = versions.reduce((max, v) => (v.version > max ? v.version : max), 0) + 1;
	const newRecord: PageVersion = {
		version: nextVersion,
		status: 'draft',
		preview_key: generatePreviewKey(),
		contents: baseContents
	};
	versions.push(newRecord);
	result.pageVersion = {
		scopeId: page.scopeId,
		routeId: page.routeId,
		params: pageEntry.params,
		version: newRecord.version,
		preview_key: newRecord.preview_key
	};
	return result;
};

const paramsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const k of aKeys) {
		if (a[k] !== b[k]) return false;
	}
	return true;
};
