/**
 * The site's pages as link targets, for the page picker in link editors.
 * Fetched once per endpoint and shared by every picker on the page.
 */
import { resolveRouteUrl } from './resolve-route.js';

type PageEntry = {
	params: Record<string, string>;
	isDraft: boolean;
	isDeletePending: boolean;
	redirectTo?: string;
	gone?: boolean;
};
type PageRoute = { routeId: string; ownedParams: string[]; entries: PageEntry[] };

export type PageOption = {
	/** `routeId::{params}` — stable key for a select. */
	value: string;
	/** The resolved URL, shown to the editor. */
	label: string;
	routeId: string;
	params: Record<string, string>;
};

export const pageOptionValue = (routeId: string, params: Record<string, string>): string =>
	`${routeId}::${JSON.stringify(params)}`;

export const toPageOptions = (routes: PageRoute[]): PageOption[] => {
	const opts: PageOption[] = [];
	for (const r of routes) {
		const entries =
			r.entries.length > 0
				? r.entries
				: [{ params: {} as Record<string, string>, isDraft: false, isDeletePending: false }];
		for (const ent of entries) {
			// Tombstones (redirected / gone) aren't real link targets.
			if (ent.redirectTo || ent.gone) continue;
			let url: string;
			try {
				url = resolveRouteUrl(r.routeId, ent.params);
			} catch {
				continue;
			}
			opts.push({
				value: pageOptionValue(r.routeId, ent.params),
				label: url,
				routeId: r.routeId,
				params: ent.params
			});
		}
	}
	opts.sort((a, b) => a.label.localeCompare(b.label));
	return opts;
};

const cache = new Map<string, Promise<PageOption[]>>();

export const fetchPageOptions = (endpoint: string): Promise<PageOption[]> => {
	let p = cache.get(endpoint);
	if (!p) {
		p = fetch(`${endpoint}/pages`, { credentials: 'include' })
			.then(async (res) => {
				if (!res.ok) return [];
				const data = (await res.json()) as { routes: PageRoute[] };
				return toPageOptions(data.routes);
			})
			.catch(() => {
				cache.delete(endpoint);
				return [] as PageOption[];
			});
		cache.set(endpoint, p);
	}
	return p;
};
