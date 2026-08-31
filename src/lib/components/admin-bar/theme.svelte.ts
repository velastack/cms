/**
 * Shared theme state for the admin bar and editable CMS components.
 *
 * The View → Theme menu writes here; the bar's wrapper, every editable
 * component's `<CssRoot>`, and the system-preference listener all read from
 * the same singleton so theme changes propagate everywhere immediately.
 */

import { browser } from '$app/environment';

export type AdminBarTheme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'cms.theme';

const readStoredTheme = (): AdminBarTheme | null => {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
};

class AdminBarThemeState {
	pref = $state<AdminBarTheme>(browser ? (readStoredTheme() ?? 'system') : 'system');
	systemPrefersDark = $state(false);

	get resolved(): 'light' | 'dark' {
		return this.pref === 'system' ? (this.systemPrefersDark ? 'dark' : 'light') : this.pref;
	}

	setPref(next: AdminBarTheme) {
		this.pref = next;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			/* private mode etc. — non-fatal */
		}
	}
}

export const adminBarTheme = new AdminBarThemeState();

if (browser) {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	adminBarTheme.systemPrefersDark = mq.matches;
	mq.addEventListener('change', (e) => {
		adminBarTheme.systemPrefersDark = e.matches;
	});
}
