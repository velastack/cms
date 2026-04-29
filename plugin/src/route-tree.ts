import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type RouteNode = {
	/** Route id in SvelteKit form: `'/'`, `'/(marketing)'`, `'/(marketing)/rooms/[slug]'`. */
	routeId: string;
	/** Absolute path to `+layout.svelte` in this directory, if present. */
	layoutPath: string | null;
	/** Absolute path to `+page.svelte` in this directory, if present. */
	pagePath: string | null;
	/** Absolute path to `+page.ts` in this directory, if present. */
	pageScriptPath: string | null;
	/** Absolute path to `+page.server.ts` in this directory, if present. */
	pageServerScriptPath: string | null;
	/** Absolute path to `page.cms.ts` in this directory, if present. */
	pageCmsPath: string | null;
};

const toRouteId = (routesDir: string, dir: string): string => {
	const rel = relative(routesDir, dir).split(/[\\/]/).join('/');
	return rel === '' ? '/' : '/' + rel;
};

/**
 * Walk `routesDir` and return one entry per directory, recording whether it
 * contains a `+layout.svelte` and/or `+page.svelte`. Does not currently
 * understand `+page@layout.svelte` reset segments — that's deferred.
 */
export const discoverRoutes = (routesDir: string): RouteNode[] => {
	if (!existsSync(routesDir)) return [];
	const out: RouteNode[] = [];
	const visit = (dir: string) => {
		const layoutPath = join(dir, '+layout.svelte');
		const pagePath = join(dir, '+page.svelte');
		const pageScriptPath = join(dir, '+page.ts');
		const pageServerScriptPath = join(dir, '+page.server.ts');
		const pageCmsPath = join(dir, 'page.cms.ts');
		out.push({
			routeId: toRouteId(routesDir, dir),
			layoutPath: existsSync(layoutPath) ? layoutPath : null,
			pagePath: existsSync(pagePath) ? pagePath : null,
			pageScriptPath: existsSync(pageScriptPath) ? pageScriptPath : null,
			pageServerScriptPath: existsSync(pageServerScriptPath) ? pageServerScriptPath : null,
			pageCmsPath: existsSync(pageCmsPath) ? pageCmsPath : null
		});
		for (const entry of readdirSync(dir)) {
			if (entry.startsWith('+') || entry.startsWith('.')) continue;
			const full = join(dir, entry);
			let stat;
			try {
				stat = statSync(full);
			} catch {
				continue;
			}
			if (stat.isDirectory()) visit(full);
		}
	};
	visit(routesDir);
	return out;
};

/**
 * Ancestors (inclusive) of a route id, ordered from root to leaf:
 * `'/(marketing)/about'` → `['/', '/(marketing)', '/(marketing)/about']`.
 */
export const ancestorRouteIds = (routeId: string): string[] => {
	if (routeId === '/') return ['/'];
	const parts = routeId.slice(1).split('/');
	const out: string[] = ['/'];
	let acc = '';
	for (const p of parts) {
		acc += '/' + p;
		out.push(acc);
	}
	return out;
};

/** Extract `[param]` segment names from a SvelteKit route id, in order. */
export const extractRouteParams = (routeId: string): string[] => {
	const matches = routeId.matchAll(/\[(?:\.\.\.)?([^/\]]+)\]/g);
	return [...matches].map((m) => m[1]);
};
