import type { ServerLoadEvent } from '@sveltejs/kit';
import { loadCms, type LoadCmsResult } from './load-cms.js';
import type { CmsAdapter } from './types.js';

export type CreateCmsOptions = {
	/** Adapter that talks to the backing store. */
	adapter: CmsAdapter;
	/** BCP-47 locale for requests, e.g. `'en'` or `'es-MX'`. */
	locale: string;
};

export type Cms = {
	/**
	 * Resolve the CMS payload for the current SvelteKit request. Mirrors
	 * {@link loadCms} but with the adapter and locale already bound.
	 */
	load: (event: ServerLoadEvent) => Promise<LoadCmsResult>;
	/**
	 * Build a SvelteKit prerender `entries()` function for one route. When
	 * called with no `routeId`, the velacms Vite plugin substitutes the
	 * importing `+page.{ts,server.ts}`'s route id at build time. Pass an
	 * explicit `routeId` (e.g. `'/(marketing)/rooms/[slug]' satisfies
	 * RouteId`) to opt out of the plugin transform.
	 */
	generateEntries: (routeId?: string) => () => Promise<Record<string, string>[]>;
};

/**
 * Bind a {@link CmsAdapter} + locale into a small object of helpers used by
 * SvelteKit route files. The returned `load` and `generateEntries` close
 * over the adapter, so call sites never re-pass it.
 *
 * Typical usage:
 *
 * ```ts
 * // $lib/cms.ts
 * import { createCms, mockAdapter } from 'velacms/server';
 * export const { load: loadCms, generateEntries } = createCms({
 *   adapter: mockAdapter({ layoutDocs, pageDocs }),
 *   locale: 'en'
 * });
 * ```
 */
export const createCms = (options: CreateCmsOptions): Cms => {
	const { adapter, locale } = options;
	return {
		load: (event) => loadCms(event, { adapter, locale }),
		generateEntries: (routeId?: string) => async () => {
			if (!routeId) {
				throw new Error(
					'generateEntries: routeId not injected. Did the velacms Vite plugin run?'
				);
			}
			if (!adapter.fetchEntries) return [];
			return await adapter.fetchEntries(routeId, { fetch });
		}
	};
};
