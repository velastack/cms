/**
 * Lodash-style path utilities for tree-shaped CMS state.
 *
 * Paths are dot-separated strings: `welcome.title`, `gallery.0.caption`,
 * `metadata.openGraph.image.url`. Numeric segments index arrays. There are
 * no brackets — `gallery[0].caption` is not supported. When `set` walks into
 * a missing parent, the next segment's shape decides whether to create an
 * array (numeric) or a plain object (anything else).
 *
 * `mergeTree` deep-merges plain objects but **replaces arrays wholesale** —
 * critical so a repeater's reorder/delete doesn't accidentally concat with
 * the previous order.
 */

export type Tree = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Tree =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

const isIndex = (s: string): boolean => /^[0-9]+$/.test(s);

export const parsePath = (path: string): string[] => (path === '' ? [] : path.split('.'));

export const get = (tree: unknown, path: string): unknown => {
	const segs = parsePath(path);
	let cur: unknown = tree;
	for (const s of segs) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[s];
	}
	return cur;
};

export const has = (tree: unknown, path: string): boolean => {
	const segs = parsePath(path);
	if (segs.length === 0) return tree !== undefined;
	let cur: unknown = tree;
	for (let i = 0; i < segs.length; i++) {
		if (cur == null || typeof cur !== 'object') return false;
		if (!(segs[i] in (cur as object))) return false;
		cur = (cur as Record<string, unknown>)[segs[i]];
	}
	return true;
};

export const set = (tree: Tree, path: string, value: unknown): void => {
	const segs = parsePath(path);
	if (segs.length === 0) throw new Error('set: empty path');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let cur: any = tree;
	for (let i = 0; i < segs.length - 1; i++) {
		const seg = segs[i];
		const next = segs[i + 1];
		const child = cur[seg];
		if (child == null || typeof child !== 'object') {
			cur[seg] = isIndex(next) ? [] : {};
		}
		cur = cur[seg];
	}
	cur[segs[segs.length - 1]] = value;
};

export const unset = (tree: Tree, path: string): boolean => {
	const segs = parsePath(path);
	if (segs.length === 0) return false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let cur: any = tree;
	for (let i = 0; i < segs.length - 1; i++) {
		if (cur == null || typeof cur !== 'object') return false;
		cur = cur[segs[i]];
	}
	if (cur == null || typeof cur !== 'object') return false;
	const last = segs[segs.length - 1];
	if (!(last in cur)) return false;
	delete cur[last];
	return true;
};

export const mergeTree = (...trees: Array<Tree | undefined>): Tree => {
	const out: Tree = {};
	for (const tree of trees) {
		if (!tree) continue;
		for (const [k, v] of Object.entries(tree)) {
			const prev = out[k];
			if (isPlainObject(v) && isPlainObject(prev)) {
				out[k] = mergeTree(prev, v);
			} else {
				out[k] = v;
			}
		}
	}
	return out;
};

/**
 * Sorted leaf paths whose values differ between `before` and `after`. Used by
 * the publish dialog to summarize what changed in a release item.
 *
 * Treats `undefined` as an empty tree at the root, so adding/removing top-level
 * branches still produces leaf paths. Two arrays of equal length recurse per
 * index; arrays of differing length emit the array path itself (aligns with
 * `mergeTree`'s array-replace semantics).
 */
export const diffPaths = (before: unknown, after: unknown): string[] => {
	const out: string[] = [];
	walk(before ?? {}, after ?? {}, '', out);
	out.sort();
	return out;
};

const walk = (b: unknown, a: unknown, prefix: string, out: string[]): void => {
	if (b === a) return;

	// One side undefined, the other a tree → enumerate the tree's leaves.
	if (b === undefined && (isPlainObject(a) || Array.isArray(a))) {
		walkLeaves(a, prefix, out);
		return;
	}
	if (a === undefined && (isPlainObject(b) || Array.isArray(b))) {
		walkLeaves(b, prefix, out);
		return;
	}

	if (isPlainObject(b) && isPlainObject(a)) {
		const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
		for (const k of keys) {
			const sub = prefix ? `${prefix}.${k}` : k;
			walk(b[k], a[k], sub, out);
		}
		return;
	}

	if (Array.isArray(b) && Array.isArray(a) && b.length === a.length) {
		for (let i = 0; i < b.length; i++) {
			const sub = prefix ? `${prefix}.${i}` : `${i}`;
			walk(b[i], a[i], sub, out);
		}
		return;
	}

	if (prefix) out.push(prefix);
};

const walkLeaves = (v: unknown, prefix: string, out: string[]): void => {
	if (isPlainObject(v)) {
		for (const [k, sub] of Object.entries(v)) {
			const p = prefix ? `${prefix}.${k}` : k;
			walkLeaves(sub, p, out);
		}
		return;
	}
	if (Array.isArray(v)) {
		for (let i = 0; i < v.length; i++) {
			const p = prefix ? `${prefix}.${i}` : `${i}`;
			walkLeaves(v[i], p, out);
		}
		return;
	}
	if (prefix) out.push(prefix);
};
