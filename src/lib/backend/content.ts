/**
 * A project's content as a set of documents, for anything that reads and
 * edits it without the admin bar: an assistant over MCP, a chat bot, a script.
 *
 * A document is Site Options (`site`), a layout (`layout:<route id>`) or a
 * page (`page:<route id>`, with `#<params as JSON>` for one entry of a
 * dynamic route). An edit names a field by dot path and gives it a new value.
 * Only fields that already exist can change, and only to a value of the type
 * they hold, so nothing the site does not render is ever written.
 *
 * Edits go where the admin bar's go: into the editor's open release, then out
 * as a published release, so they are in the release history and can be
 * reverted from there.
 */
import { mergeTree, type Tree } from '../core/path.js';
import type { PageEntry } from '../core/page-entry.js';
import type { PublishedRelease } from '../core/wire.js';
import type { CmsStore } from './store/queries.js';
import type { CmsEditor } from './types.js';

type AddReleaseItemInput = Parameters<CmsStore['addReleaseItems']>[2][number];

export interface ContentDoc {
	id: string;
	tree: Tree;
}

/** One field to change: a leaf of a document, by dot path. */
export interface ContentChange {
	/** `site`, `layout:<route id>` or `page:<route id>`. */
	doc: string;
	/** Dot path of the field, list items by index (`hours.0.open`). */
	path: string;
	value: string | number | boolean;
	/** The language version to change; Site Options (`site`) has only one. */
	locale: string;
}

/** A change waiting in an editor's open release, with what it replaces. */
export interface StagedChange {
	doc: string;
	locale: string;
	path: string;
	from: unknown;
	to: unknown;
}

type ReadStore = Pick<CmsStore, 'exportPublished'>;
type DraftStore = Pick<CmsStore, 'exportPublished' | 'getOpenRelease'>;
type EditStore = Pick<
	CmsStore,
	'exportPublished' | 'getOpenRelease' | 'addReleaseItems' | 'publishRelease' | 'discardOpenRelease'
>;

const isTree = (value: unknown): value is Tree =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const isEntries = (value: unknown): value is PageEntry[] => Array.isArray(value);

/** The locales a project has published content in, the one with most documents first. */
export function contentLocales(store: ReadStore, projectId: string): string[] {
	const published = store.exportPublished(projectId);
	const count = new Map<string, number>();
	for (const group of [published.layouts ?? {}, published.pages ?? {}]) {
		for (const [locale, docs] of Object.entries(group)) {
			count.set(locale, (count.get(locale) ?? 0) + Object.keys(docs).length);
		}
	}
	return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([locale]) => locale);
}

const pageDocId = (routeId: string, params: Record<string, string>) =>
	Object.keys(params).length > 0 ? `page:${routeId}#${JSON.stringify(params)}` : `page:${routeId}`;

/** Every published document of `projectId` in `locale`, Site Options included. */
export function readContent(store: ReadStore, projectId: string, locale: string): ContentDoc[] {
	const published = store.exportPublished(projectId);
	const docs: ContentDoc[] = [];
	if (isTree(published.site) && Object.keys(published.site).length) {
		docs.push({ id: 'site', tree: published.site });
	}
	for (const [routeId, tree] of Object.entries(published.layouts?.[locale] ?? {})) {
		docs.push({ id: `layout:${routeId}`, tree });
	}
	for (const [routeId, page] of Object.entries(published.pages?.[locale] ?? {})) {
		if (isEntries(page)) {
			for (const entry of page) {
				if (entry.tombstone) continue;
				docs.push({ id: pageDocId(routeId, entry.params), tree: entry.published });
			}
		} else if (isTree(page)) {
			docs.push({ id: `page:${routeId}`, tree: page });
		}
	}
	return docs;
}

/**
 * The documents as `editorId` would publish them: what is published, with the
 * edits waiting in their open release laid over it. Staging reads this, not
 * the published content, so a second edit builds on the first.
 */
export function readDraft(
	store: DraftStore,
	projectId: string,
	locale: string,
	editorId: string
): ContentDoc[] {
	const docs = readContent(store, projectId, locale);
	const release = store.getOpenRelease(projectId, editorId);
	if (!release) return docs;
	for (const item of release.items) {
		if (item.kind === 'page-delete') continue;
		if (item.kind !== 'site' && item.locale !== locale) continue;
		const id =
			item.kind === 'site'
				? 'site'
				: item.kind === 'layout'
					? `layout:${item.routeId}`
					: pageDocId(item.routeId, item.params);
		const doc = docs.find((d) => d.id === id);
		if (doc) doc.tree = mergeTree(doc.tree, item.tree);
	}
	return docs;
}

const segments = (path: string) => path.split('.').filter((segment) => segment !== '');

function getAt(tree: unknown, path: string[]): unknown {
	let node = tree;
	for (const segment of path) {
		if (Array.isArray(node)) node = node[Number(segment)];
		else if (isTree(node)) node = node[segment];
		else return undefined;
	}
	return node;
}

function setAt(tree: Tree | unknown[], path: string[], value: unknown) {
	let node: Record<string, unknown> = tree as Record<string, unknown>;
	for (const segment of path.slice(0, -1)) {
		const next = node[segment];
		if (!next || typeof next !== 'object') node[segment] = {};
		node = node[segment] as Record<string, unknown>;
	}
	node[path[path.length - 1]] = value;
}

const isIndex = (segment: string) => /^\d+$/.test(segment);

/** Segments no path may use: they reach the prototype rather than the content. */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** Why `change` cannot be made to `docs`, or null when it can. */
export function changeProblem(docs: ContentDoc[], change: ContentChange): string | null {
	const doc = docs.find((d) => d.id === change.doc);
	if (!doc) return `there is no document "${change.doc}"`;
	const path = segments(change.path);
	if (path.length === 0 || path.some((segment) => FORBIDDEN.has(segment))) {
		return `"${change.path}" is not a field path`;
	}
	const current = getAt(doc.tree, path);
	if (current === undefined) return `"${change.doc}" has no field "${change.path}"`;
	if (current === null || typeof current === 'object') {
		return `"${change.path}" is a group of fields, not one field; name the field inside it`;
	}
	if (typeof current !== typeof change.value) {
		return `"${change.path}" holds a ${typeof current}, not a ${typeof change.value}`;
	}
	if (typeof change.value === 'string' && change.value.length > 20_000) {
		return `the new value of "${change.path}" is too long`;
	}
	return null;
}

function parseDocId(id: string): {
	kind: 'site' | 'layout' | 'page';
	routeId: string;
	params: Record<string, string>;
} {
	if (id === 'site') return { kind: 'site', routeId: '', params: {} };
	const kind = id.startsWith('layout:') ? 'layout' : 'page';
	const rest = id.slice(kind.length + 1);
	const hash = rest.indexOf('#');
	if (kind === 'layout' || hash === -1) return { kind, routeId: rest, params: {} };
	return { kind, routeId: rest.slice(0, hash), params: JSON.parse(rest.slice(hash + 1)) };
}

/**
 * The release items that make `changes`: one patch tree per document. The CMS
 * merges a patch into the published tree but replaces arrays whole, so a
 * change inside a list carries the full list with that one field changed.
 */
export function toReleaseItems(
	docs: ContentDoc[],
	locale: string,
	changes: ContentChange[]
): AddReleaseItemInput[] {
	const patches = new Map<string, Tree>();
	for (const change of changes) {
		const doc = docs.find((d) => d.id === change.doc);
		if (!doc) continue;
		const patch = patches.get(doc.id) ?? {};
		patches.set(doc.id, patch);
		const path = segments(change.path);
		const firstIndex = path.findIndex(isIndex);
		if (firstIndex === -1) {
			setAt(patch, path, change.value);
			continue;
		}
		const listPath = path.slice(0, firstIndex);
		const list =
			(getAt(patch, listPath) as unknown[] | undefined) ??
			structuredClone(getAt(doc.tree, listPath) as unknown[]);
		setAt(list, path.slice(firstIndex), change.value);
		setAt(patch, listPath, list);
	}
	return [...patches.entries()].map(([id, tree]): AddReleaseItemInput => {
		const { kind, routeId, params } = parseDocId(id);
		if (kind === 'site') return { kind: 'site', tree };
		if (kind === 'layout') return { kind: 'layout', routeId, locale, tree };
		return { kind: 'page', routeId, locale, params, tree };
	});
}

export class ContentEditError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ContentEditError';
	}
}

const byLocale = (changes: ContentChange[]) => {
	const groups = new Map<string, ContentChange[]>();
	for (const change of changes) {
		groups.set(change.locale, [...(groups.get(change.locale) ?? []), change]);
	}
	return groups;
};

/**
 * Add `changes` to `editorId`'s open release, on top of what is already
 * there. All of them are checked first: one that does not apply throws a
 * `ContentEditError` and stages nothing. Returns each change with the value
 * it replaces.
 */
export function stageChanges(
	store: EditStore,
	projectId: string,
	editorId: string,
	changes: ContentChange[]
): StagedChange[] {
	const staged: StagedChange[] = [];
	const items: AddReleaseItemInput[] = [];
	for (const [locale, group] of byLocale(changes)) {
		const docs = readDraft(store, projectId, locale, editorId);
		for (const change of group) {
			const problem = changeProblem(docs, change);
			if (problem) throw new ContentEditError(`${locale}: ${problem}`);
			const doc = docs.find((d) => d.id === change.doc)!;
			staged.push({
				doc: change.doc,
				locale,
				path: change.path,
				from: getAt(doc.tree, segments(change.path)),
				to: change.value
			});
		}
		items.push(...toReleaseItems(docs, locale, group));
	}
	if (items.length === 0) throw new ContentEditError('nothing to change');
	store.addReleaseItems(projectId, editorId, items);
	return staged;
}

function leafChanges(
	doc: string,
	locale: string,
	before: unknown,
	after: unknown,
	path: string[],
	out: StagedChange[]
) {
	if (Array.isArray(after) || isTree(after)) {
		for (const [key, value] of Object.entries(after)) {
			leafChanges(doc, locale, getAt(before, [key]), value, [...path, key], out);
		}
		return;
	}
	if (before !== after) out.push({ doc, locale, path: path.join('.'), from: before, to: after });
}

/**
 * What is waiting in `editorId`'s open release, field by field, against what
 * is published. Covers edits made anywhere the editor works, the admin bar
 * included. Page deletions are reported as a change of the whole page.
 */
export function stagedChanges(
	store: DraftStore,
	projectId: string,
	editorId: string
): StagedChange[] {
	const release = store.getOpenRelease(projectId, editorId);
	if (!release) return [];
	const out: StagedChange[] = [];
	const published = new Map<string, ContentDoc[]>();
	const docsIn = (locale: string) => {
		if (!published.has(locale)) published.set(locale, readContent(store, projectId, locale));
		return published.get(locale)!;
	};
	for (const item of release.items) {
		if (item.kind === 'page-delete') {
			out.push({
				doc: pageDocId(item.routeId, item.params),
				locale: item.locale,
				path: '',
				from: 'published',
				to: 'deleted'
			});
			continue;
		}
		const locale = item.kind === 'site' ? '' : item.locale;
		const id =
			item.kind === 'site'
				? 'site'
				: item.kind === 'layout'
					? `layout:${item.routeId}`
					: pageDocId(item.routeId, item.params);
		const before = docsIn(locale || (contentLocales(store, projectId)[0] ?? '')).find(
			(d) => d.id === id
		)?.tree;
		leafChanges(id, locale, before, item.tree, [], out);
	}
	return out;
}

/**
 * Publish `editor`'s open release. Returns null when nothing is staged.
 */
export function publishStaged(
	store: Pick<CmsStore, 'publishRelease'>,
	projectId: string,
	editor: CmsEditor,
	releaseName: string
): PublishedRelease | null {
	return store.publishRelease(projectId, editor, releaseName.slice(0, 120));
}

/**
 * Make `changes` and publish them at once, as one release by `editor`, for a
 * caller that got its confirmation elsewhere. Anything left in the editor's
 * open release is discarded first, so only these changes go out. Throws a
 * `ContentEditError` and changes nothing when one does not apply.
 */
export function applyChanges(
	store: EditStore,
	projectId: string,
	editor: CmsEditor,
	changes: ContentChange[],
	releaseName: string
): PublishedRelease {
	for (const [locale, group] of byLocale(changes)) {
		const docs = readContent(store, projectId, locale);
		for (const change of group) {
			const problem = changeProblem(docs, change);
			if (problem) throw new ContentEditError(`${locale}: ${problem}`);
		}
	}
	store.discardOpenRelease(projectId, editor.id);
	stageChanges(store, projectId, editor.id, changes);
	const published = publishStaged(store, projectId, editor, releaseName);
	if (!published) throw new ContentEditError('the change could not be published');
	return published;
}

/** How much content one read hands a model by default, in characters of JSON. */
export const CONTENT_READ_BUDGET = 80_000;

/** `docs` within `budget` characters of JSON, largest documents dropped first. */
export function fitContent(
	docs: ContentDoc[],
	budget: number = CONTENT_READ_BUDGET
): { docs: ContentDoc[]; omitted: string[] } {
	const sized = docs.map((doc) => ({ doc, size: JSON.stringify(doc.tree).length }));
	let total = sized.reduce((sum, entry) => sum + entry.size, 0);
	const omitted: string[] = [];
	for (const entry of [...sized].sort((a, b) => b.size - a.size)) {
		if (total <= budget) break;
		omitted.push(entry.doc.id);
		total -= entry.size;
	}
	return { docs: docs.filter((doc) => !omitted.includes(doc.id)), omitted };
}
