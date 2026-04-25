import { setContext } from 'svelte';
import { page } from '$app/state';
import { CMS_SCOPE, type CmsScope } from './scope.js';

export type InstallCmsScopeConfig = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
};

const composeScopeKey = (scopeId: string, params: Record<string, string>): string => {
	const keys = Object.keys(params).sort();
	if (keys.length === 0) return scopeId;
	const qp = keys
		.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
		.join('&');
	return `${scopeId}?${qp}`;
};

/**
 * Used by the build-time auto-injection in `+layout.svelte` / `+page.svelte`.
 * Sets the `CMS_SCOPE` Svelte context to a runes-backed scope object that
 * tracks `page.params` so navigation between sibling param values updates the
 * scope key (e.g. `?slug=suite-1` → `?slug=suite-2`).
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
	// Compute synchronously at init so SSR sees the right scopeKey — `$effect`
	// only fires on the client.
	const initialParams = collectOwnedParams(
		config.ownedParams,
		page.params as Record<string, string | undefined>
	);

	const scope = $state<CmsScope>({
		scopeId: config.scopeId,
		scopeKey: composeScopeKey(config.scopeId, initialParams),
		kind: config.kind,
		routeId: config.routeId,
		params: initialParams
	});

	$effect(() => {
		const params = collectOwnedParams(
			config.ownedParams,
			page.params as Record<string, string | undefined>
		);
		scope.params = params;
		scope.scopeKey = composeScopeKey(config.scopeId, params);
	});

	setContext(CMS_SCOPE, scope);
};
