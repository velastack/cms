/**
 * Pure locale-fallback merge helpers, shared between the server-load path
 * (`resolveCmsPayload`) and the client-overlay path (`loadAndApplyOverlay`)
 * so both compose the same `requested → default → undefined` chain.
 *
 * The convention (see `mock-adapter.ts`'s contract): adapters return only
 * what's stored for the requested locale. Callers fetch the requested locale
 * AND the default locale separately, then call these helpers to produce the
 * fallback-merged result. Defaults fill gaps; requested values override.
 *
 * Tombstones are not handled here — callers should resolve tombstone
 * precedence (requested wins outright) before passing trees in.
 */

import type { CmsEntry } from './scope.js';
import { mergeTree, type Tree } from '../../core/path.js';

/**
 * Merge requested-locale doc trees over default-locale doc trees, per scope.
 *
 * - Both present → `mergeTree(fallback, requested)` (requested overrides on
 *   leaves; objects deep-merge; arrays replace).
 * - Requested only → returned as-is (requested locale has its own content;
 *   default-locale entry happens to be missing — surface what we have).
 * - Fallback only → returned as-is (requested locale lacks the scope; show
 *   the default-locale value).
 * - Neither → scope omitted from output.
 *
 * Pass `fallback = null` for the no-fallback case (locale === defaultLocale,
 * or single-locale fetch); the function then just unwraps `requested`.
 */
export const mergeLocaleDocs = (
	requested: Record<string, Tree | undefined>,
	fallback: Record<string, Tree | undefined> | null
): Record<string, Tree> => {
	const out: Record<string, Tree> = {};
	const scopeIds = new Set<string>([
		...Object.keys(requested),
		...(fallback ? Object.keys(fallback) : [])
	]);
	for (const scopeId of scopeIds) {
		const r = requested[scopeId];
		const f = fallback?.[scopeId];
		if (f && r) out[scopeId] = mergeTree(f, r);
		else if (f) out[scopeId] = f;
		else if (r) out[scopeId] = r;
	}
	return out;
};

/**
 * Merge requested-locale entry lists over default-locale entry lists, per
 * routeId. Entries are unioned by stringified `params`; requested-locale
 * entries win on metadata when both locales have the same `params`.
 *
 * Pass `fallback = null` for the no-fallback case; the function then returns
 * the requested map verbatim (each list is whatever the caller stored).
 *
 * Tombstone filtering (`redirectTo`, `gone`) happens at the call site.
 */
export const mergeLocaleEntries = (
	requested: Record<string, CmsEntry[]>,
	fallback: Record<string, CmsEntry[]> | null
): Record<string, CmsEntry[]> => {
	if (!fallback) {
		const out: Record<string, CmsEntry[]> = {};
		for (const [rid, list] of Object.entries(requested)) out[rid] = [...list];
		return out;
	}
	const out: Record<string, CmsEntry[]> = {};
	const routeIds = new Set<string>([...Object.keys(requested), ...Object.keys(fallback)]);
	for (const routeId of routeIds) {
		const r = requested[routeId] ?? [];
		const f = fallback[routeId] ?? [];
		const merged = new Map<string, CmsEntry>();
		for (const e of f) merged.set(JSON.stringify(e.params), e);
		for (const e of r) merged.set(JSON.stringify(e.params), e);
		out[routeId] = [...merged.values()];
	}
	return out;
};
