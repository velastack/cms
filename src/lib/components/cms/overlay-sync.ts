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
	/** `previewKey: null` fetches published-only. Used whenever there is no
	 *  open draft: the overlay then carries the locale's *current* published
	 *  tree (with default-locale fallback merged by `loadAndApplyOverlay`'s
	 *  dual-fetch), masking `page.data.cms.docs` — which on a static-export
	 *  site is frozen at build time and goes stale with every publish. */
	| { kind: 'load-overlay'; previewKey: string | null; locale: string };

export interface OverlaySyncInput {
	/** `?version=…` URL param: when set, we're in past-release snapshot mode. */
	versionKey: string | null;
	/** Active editor preview locale (URL `?locale=` overriding `cms.locale`). */
	locale: string;
	/**
	 * `page.data.cms.locale` — the locale the server rendered for this request.
	 * Kept on the input for parity with the store's `mergedTree`, which only
	 * folds `cms.docs` into the base when `locale === pageLocale`. The sync
	 * decision no longer branches on it: the published overlay is loaded
	 * either way (see rule 7).
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
 *    fall through to rule 7 in the *same* intent batch so the field render
 *    isn't briefly empty between strip and the next effect run.
 * 7. With no open release: load the published-only overlay for `locale`.
 *    The page's `cms.docs` is NOT authoritative for an editor — on a
 *    static-export site it was captured at build time, so after any later
 *    publish it lags the backend until the next deploy. The overlay fetched
 *    from `/docs` is always current, and for `locale !== pageLocale` it is
 *    the only source of content at all (`mergedTree` folds in no base for
 *    other locales). The dual-fetch in `loadAndApplyOverlay` composes the
 *    `requested → default → undefined` chain.
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

	intents.push({ kind: 'load-overlay', previewKey: null, locale: input.locale });
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
