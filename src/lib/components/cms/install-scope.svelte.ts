import { setContext } from 'svelte';
import { page } from '$app/state';
import { CMS_SCOPE, type CmsScope } from './scope.js';

export type InstallCmsScopeConfig = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
};

/**
 * Used by the build-time auto-injection in `+layout.svelte` / `+page.svelte`.
 * Sets the `CMS_SCOPE` Svelte context to a runes-backed scope object that
 * tracks `page.params` so navigation between sibling param values updates the
 * scope's `params` (e.g. `{ slug: 'suite-1' }` → `{ slug: 'suite-2' }`).
 */
const collectOwnedParams = (
	ownedParams: string[],
	all: Record<string, string | undefined>
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const p of ownedParams) {
		const v = all[p];
		if (typeof v === 'string') out[p] = v;
	}
	return out;
};

export const installCmsScope = (config: InstallCmsScopeConfig): void => {
	// Compute synchronously at init so SSR sees the right params — `$effect`
	// only fires on the client.
	const initialParams = collectOwnedParams(
		config.ownedParams,
		page.params as Record<string, string | undefined>
	);

	const scope = $state<CmsScope>({
		scopeId: config.scopeId,
		kind: config.kind,
		routeId: config.routeId,
		params: initialParams
	});

	$effect(() => {
		scope.params = collectOwnedParams(
			config.ownedParams,
			page.params as Record<string, string | undefined>
		);
	});

	setContext(CMS_SCOPE, scope);
};
