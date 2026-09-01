/**
 * The published-page shape, shared by every layer that touches it: the
 * in-memory `mockAdapter`, the SSR read path, and the HTTP backend's SQLite
 * store. It used to exist three times — once here, once in the backend, and
 * once hand-copied into the velastack app — with comments in each copy asking
 * the next person to mirror changes by hand. This is the one copy.
 */
import type { Tree } from './path.js';

/**
 * Outcome of a page-delete release item: omit for a hard delete (404 after
 * publish), `gone` for permanent removal (410), or `redirect` to a target URL
 * for a permanent redirect (308). When set, publish leaves the {@link PageEntry}
 * in place with `tombstone` populated instead of removing the row, so `/docs`
 * can surface it as `{ kind: 'gone' }` or `{ kind: 'redirect', to }`.
 */
export type PageDeleteOutcome = { kind: 'gone' } | { kind: 'redirect'; to: string };

/**
 * One page-kind entry: a specific (`routeId`, `params`) pair and its currently
 * published content. `routeId` is the SvelteKit route id (e.g.
 * `/(marketing)/rooms/[slug]`); `params` binds that route's owned params (e.g.
 * `{ slug: 'suite-1' }`). Static page routes have `params: {}` and exactly one
 * entry per route id.
 *
 * Pending edits live in releases, not on the entry — saving a draft adds an
 * item to the editor's open release rather than mutating published content.
 *
 * `tombstone`, when set, marks a published tombstone: the page was deleted with
 * a non-404 outcome in a prior release. `published` is still required (for
 * {@link findPageEntry} symmetry, and so revert can restore it) but is ignored
 * while `tombstone` is set.
 */
export type PageEntry = {
	params: Record<string, string>;
	published: Tree;
	tombstone?: PageDeleteOutcome;
};

/** Match a {@link PageEntry} whose `params` map equals the requested params. */
export const findPageEntry = (
	entries: PageEntry[] | undefined,
	params: Record<string, string>
): PageEntry | undefined => {
	if (!entries) return undefined;
	const keys = Object.keys(params);
	for (const entry of entries) {
		const entryKeys = Object.keys(entry.params);
		if (entryKeys.length !== keys.length) continue;
		let match = true;
		for (const k of keys) {
			if (entry.params[k] !== params[k]) {
				match = false;
				break;
			}
		}
		if (match) return entry;
	}
	return undefined;
};
