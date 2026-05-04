/**
 * Pure decision logic for the editor overlay sync. The admin bar reads URL
 * params + store state, calls `deriveOverlayIntents`, and dispatches the
 * returned intents (URL navigations, async overlay loads, overlay clears).
 *
 * Keeping this pure lets us unit-test every (versionKey, locale, openRelease,
 * previewParam, openReleaseFetched) combination without spinning up Svelte.
 */

import type { CmsScopeRef } from './cms-store.svelte.js';

export type OverlayIntent =
	| { kind: 'fetch-open-release' }
	| { kind: 'fetch-version-release'; versionKey: string }
	| { kind: 'set-preview-param'; value: string | null }
	| { kind: 'load-version-overlay'; versionKey: string; locale: string }
	/** `previewKey: null` fetches published-only — used when previewing a
	 *  non-default locale without an open draft, so the overlay carries the
	 *  locale's published tree (with default-locale fallback merged by
	 *  `loadAndApplyOverlay`'s dual-fetch). */
	| { kind: 'load-overlay'; previewKey: string | null; locale: string }
	| { kind: 'clear-overlay' };

export interface OverlaySyncInput {
	/** `?version=…` URL param: when set, we're in past-release snapshot mode. */
	versionKey: string | null;
	/** Active editor preview locale (URL `?locale=` overriding `cms.locale`). */
	locale: string;
	/**
	 * `page.data.cms.locale` — the locale the server rendered for this request.
	 * When `locale === pageLocale`, the page's `cms.docs` already provides the
	 * base content (no overlay needed for "show the published tree"). When
	 * they differ, we must load the overlay so non-default-locale views see
	 * content (with default-locale fallback) rather than empty fields.
	 */
	pageLocale: string;
	/** Current open-release preview_key from `cmsStore.openRelease`, or null. */
	openReleaseKey: string | null;
	/** Whether `fetchOpenRelease` has resolved at least once this session. */
	openReleaseFetched: boolean;
	/** `?preview=…` URL param value, or null if absent. */
	previewParam: string | null;
}

/**
 * Decide what to do given the current sync state. Rules, in order:
 *
 * 1. If openRelease hasn't been fetched yet, always emit `fetch-open-release`.
 *    (Version mode still loads its overlay immediately; non-version decisions
 *    defer to the next pass once the fetch resolves.)
 * 2. Version mode wins: load the past-release snapshot for `versionKey` and
 *    `locale`. Don't touch `?preview=` (the consumer chose `?version=`).
 * 3. Otherwise, only act on draft-mode rules once `openReleaseFetched` is
 *    true — pre-fetch we don't know if there's a draft, so we mustn't strip
 *    a preexisting `?preview=` from the URL.
 * 4. With an open release whose key disagrees with `?preview=`, sync the URL
 *    first; the param change re-runs the effect into rule 5.
 * 5. With an open release whose key matches: load the draft overlay.
 * 6. With no open release but a stale `?preview=`: strip the param. Then
 *    fall through to rule 7's locale logic in the *same* intent batch so the
 *    field render isn't briefly empty between strip and the next effect run.
 * 7. With no open release and no draft overlay needed:
 *    - `locale === pageLocale`: clear the overlay — the page's `cms.docs` is
 *      authoritative and matching, so the field reads from base directly.
 *    - `locale !== pageLocale`: load published-only overlay. Without this,
 *      `mergedTree(non-pageLocale)` would have empty base AND empty overlay,
 *      and fields would fall through to their component fallback even though
 *      a default-locale value exists. The dual-fetch in `loadAndApplyOverlay`
 *      composes the `requested → default → undefined` chain.
 */
export function deriveOverlayIntents(input: OverlaySyncInput): OverlayIntent[] {
	const intents: OverlayIntent[] = [];

	if (!input.openReleaseFetched) {
		intents.push({ kind: 'fetch-open-release' });
	}

	if (input.versionKey) {
		intents.push(
			{ kind: 'fetch-version-release', versionKey: input.versionKey },
			{ kind: 'load-version-overlay', versionKey: input.versionKey, locale: input.locale }
		);
		return intents;
	}

	if (!input.openReleaseFetched) return intents;

	if (input.openReleaseKey && input.previewParam !== input.openReleaseKey) {
		intents.push({ kind: 'set-preview-param', value: input.openReleaseKey });
		return intents;
	}

	if (input.openReleaseKey) {
		intents.push({
			kind: 'load-overlay',
			previewKey: input.openReleaseKey,
			locale: input.locale
		});
		return intents;
	}

	if (input.previewParam) {
		intents.push({ kind: 'set-preview-param', value: null });
	}

	if (input.locale !== input.pageLocale) {
		intents.push({ kind: 'load-overlay', previewKey: null, locale: input.locale });
	} else {
		intents.push({ kind: 'clear-overlay' });
	}
	return intents;
}

/** Stable cache key for `(scope, locale)` overlay/draft buckets. */
export const composeKey = (scope: CmsScopeRef, locale: string): string => {
	const keys = Object.keys(scope.params).sort();
	const base =
		keys.length === 0
			? scope.scopeId
			: `${scope.scopeId}?${keys.map((k) => `${k}=${scope.params[k]}`).join('&')}`;
	return `${base}|locale=${locale}`;
};
