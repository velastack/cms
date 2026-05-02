import type { ServerLoadEvent, LoadEvent } from '@sveltejs/kit';
import type { RouteId, RouteParams } from '$app/types';
import { loadCms, type LoadCmsResult } from './load-cms.js';
import type { CmsAdapter, CmsEntry } from './types.js';

export type CreateCmsOptions = {
	/** Adapter that talks to the backing store. */
	adapter: CmsAdapter;
	/** BCP-47 supported locales, e.g. `'en'` or `'es-MX'`. */
	locales: string[];
};

export type Cms = {
	/**
	 * Resolve the CMS payload for the current SvelteKit request. Mirrors
	 * {@link loadCms} but with the adapter and locale already bound.
	 */
	load: (event: ServerLoadEvent, { locale }: { locale: string }) => Promise<LoadCmsResult>;
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
	 * with no `routeId`, the @velastack/cms Vite plugin substitutes the importing
	 * `+page.{ts,server.ts}`'s route id at build time; the static type then
	 * widens to the union of all routes, so prefer passing the route id
	 * explicitly when you need typed `params`.
	 */
	generateEntries: {
		(): Promise<CmsEntry<RouteParams<RouteId>>[]>;
		<R extends RouteId>(routeId: R): Promise<CmsEntry<RouteParams<R>>[]>;
	};
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
 * import { createCms, mockAdapter } from '@velastack/cms/server';
 * export const { load: loadCms, generateEntries } = createCms({
 *   adapter: mockAdapter({ layoutDocs, pageDocs }),
 * });
 * ```
 */
export const createCms = (options: CreateCmsOptions): Cms => {
	const { adapter, locales } = options;
	const defaultLocale = locales[0];
	return {
		load: (event, { locale }) => loadCms(event, { adapter, locale, locales }),
		generateEntries: (async <R extends RouteId>(routeId?: R) => {
			if (!routeId) {
				throw new Error(
					'generateEntries: routeId not injected. Did the @velastack/cms Vite plugin run?'
				);
			}
			const entries = await adapter.fetchEntries(routeId, {
				fetch,
				locale: defaultLocale,
				locales
			});
			return entries as CmsEntry<RouteParams<R>>[];
		}) as Cms['generateEntries']
	};
};
