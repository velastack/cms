import type { ServerLoadEvent } from '@sveltejs/kit';
import type { RouteId, RouteParams } from '$app/types';
import { loadCms, type LoadCmsResult } from './load-cms.js';
import type { CmsAdapter, CmsEntry } from './types.js';

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
	 * Enumerate every publishable entry the adapter has at one route.
	 * Resolves to `{ params, metadata }[]` — `params` for SvelteKit's
	 * prerender `entries()` export, `metadata` (lifted from each doc's
	 * reserved `_metadata` field) for index/listing pages that need a title
	 * or description per entry.
	 *
	 * Generic in the route id: pass a literal route (e.g.
	 * `'/(marketing)/rooms/[slug]' satisfies RouteId`) and `params` is typed
	 * as that route's `RouteParams` (e.g. `{ slug: string }`). When called
	 * with no `routeId`, the velacms Vite plugin substitutes the importing
	 * `+page.{ts,server.ts}`'s route id at build time; the static type then
	 * widens to the union of all routes, so prefer passing the route id
	 * explicitly when you need typed `params`.
	 */
	generateEntries: <R extends RouteId>(routeId?: R) => Promise<CmsEntry<RouteParams<R>>[]>;
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
		generateEntries: async <R extends RouteId>(routeId?: R) => {
			if (!routeId) {
				throw new Error('generateEntries: routeId not injected. Did the velacms Vite plugin run?');
			}
			const entries = await adapter.fetchEntries(routeId, { fetch });
			return entries as CmsEntry<RouteParams<R>>[];
		}
	};
};
