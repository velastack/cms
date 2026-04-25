import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseSvelteFile, type ParsedSvelte } from './parse-svelte.js';
import {
	ancestorRouteIds,
	discoverRoutes,
	extractRouteParams,
	type RouteNode
} from './route-tree.js';

export type CmsManifestScope = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
	fields: string[];
};

export type CmsManifest = {
	version: 1;
	routes: Record<string, { scopes: CmsManifestScope[] }>;
};

export type BuildManifestOptions = {
	routesDir: string;
	libDir: string;
};

export type ScopeInfo = Pick<CmsManifestScope, 'scopeId' | 'kind' | 'routeId' | 'ownedParams'>;

export type BuildManifestResult = {
	manifest: CmsManifest;
	visitedFiles: string[];
	/** Lookup from absolute route entrypoint path to its scope info. */
	scopeByEntryPath: Map<string, ScopeInfo>;
};

const CMS_NAMED_EXPORTS = new Set(['CmsText', 'CmsRichText', 'CmsImage', 'CmsRepeater']);

const tryStatFile = (path: string): boolean => {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
};

const resolveImport = (
	source: string,
	fromFile: string,
	libDir: string
): string | null => {
	let base: string;
	if (source.startsWith('$lib/')) base = join(libDir, source.slice(5));
	else if (source === '$lib') base = libDir;
	else if (source.startsWith('./') || source.startsWith('../'))
		base = resolve(dirname(fromFile), source);
	else return null;

	const candidates = [
		base,
		base.replace(/\.js$/, '.ts'),
		base + '.svelte',
		base + '.ts',
		base + '.js',
		join(base, 'index.ts'),
		join(base, 'index.js'),
		join(base, 'index.svelte')
	];
	for (const c of candidates) {
		if (tryStatFile(c)) return c;
	}
	return null;
};

const isCmsBarrelPath = (libDir: string, path: string): boolean => {
	const barrel = join(libDir, 'components', 'cms');
	return (
		path === join(barrel, 'index.ts') ||
		path === join(barrel, 'index.js') ||
		path === barrel
	);
};

const isCmsComponentFile = (libDir: string, path: string): boolean => {
	const dir = join(libDir, 'components', 'cms');
	return /^cms-(text|rich-text|image|repeater)\.svelte$/.test(path.slice(dir.length + 1));
};

/**
 * Walk one entrypoint's static import graph (only `.svelte` files), collecting
 * field names referenced by CMS component usages. CMS classification is done
 * here (after import resolution) so relative specifiers like `./cms/index.js`
 * are recognized correctly.
 */
const collectFieldsForEntry = (
	entry: string,
	libDir: string,
	cache: Map<string, ParsedSvelte>,
	allVisited: Set<string>
): string[] => {
	const visited = new Set<string>();
	const fields: string[] = [];

	const walk = (filePath: string) => {
		if (visited.has(filePath)) return;
		visited.add(filePath);
		allVisited.add(filePath);

		let parsed = cache.get(filePath);
		if (!parsed) {
			parsed = parseSvelteFile(filePath);
			cache.set(filePath, parsed);
		}

		const cmsLocals = new Set<string>();
		for (const imp of parsed.imports) {
			const resolved = resolveImport(imp.source, filePath, libDir);
			if (!resolved) continue;
			if (isCmsBarrelPath(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (CMS_NAMED_EXPORTS.has(b.imported)) cmsLocals.add(b.local);
				}
			} else if (isCmsComponentFile(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (b.imported === 'default') cmsLocals.add(b.local);
				}
			}
		}

		for (const usage of parsed.componentUsages) {
			if (!cmsLocals.has(usage.componentName)) continue;
			if (usage.hasValueAttr || !usage.fieldName) continue;
			fields.push(usage.fieldName);
		}

		for (const imp of parsed.imports) {
			const resolved = resolveImport(imp.source, filePath, libDir);
			if (resolved && resolved.endsWith('.svelte')) walk(resolved);
		}
	};

	walk(entry);
	return [...new Set(fields)];
};

export const buildManifest = ({ routesDir, libDir }: BuildManifestOptions): BuildManifestResult => {
	const nodes = discoverRoutes(routesDir);
	const byRouteId = new Map(nodes.map((n) => [n.routeId, n]));
	const cache = new Map<string, ParsedSvelte>();
	const visitedFiles = new Set<string>();
	const scopeByEntryPath = new Map<string, ScopeInfo>();

	const routes: CmsManifest['routes'] = {};
	for (const node of nodes) {
		if (!node.pagePath) continue;
		const scopes = buildScopeChain(node, byRouteId, libDir, cache, visitedFiles);
		routes[node.routeId] = { scopes };

		// Index every entry path encountered while walking this leaf's chain so
		// the transform hook can look up scope info by file path. Layouts may be
		// indexed multiple times via different leaves — same scope, same entry,
		// so the writes are idempotent.
		for (const scope of scopes) {
			const entryNode = byRouteId.get(scope.routeId);
			const entryPath =
				scope.kind === 'layout' ? entryNode?.layoutPath : entryNode?.pagePath;
			if (!entryPath) continue;
			scopeByEntryPath.set(entryPath, {
				scopeId: scope.scopeId,
				kind: scope.kind,
				routeId: scope.routeId,
				ownedParams: scope.ownedParams
			});
		}
	}

	return {
		manifest: { version: 1, routes },
		visitedFiles: [...visitedFiles],
		scopeByEntryPath
	};
};

const buildScopeChain = (
	leaf: RouteNode,
	byRouteId: Map<string, RouteNode>,
	libDir: string,
	cache: Map<string, ParsedSvelte>,
	allVisited: Set<string>
): CmsManifestScope[] => {
	const scopes: CmsManifestScope[] = [];
	for (const dir of ancestorRouteIds(leaf.routeId)) {
		const dirNode = byRouteId.get(dir);
		if (!dirNode?.layoutPath) continue;
		scopes.push({
			scopeId: 'layout:' + dir,
			kind: 'layout',
			routeId: dir,
			ownedParams: extractRouteParams(dir),
			fields: collectFieldsForEntry(dirNode.layoutPath, libDir, cache, allVisited)
		});
	}

	scopes.push({
		scopeId: 'page:' + leaf.routeId,
		kind: 'page',
		routeId: leaf.routeId,
		ownedParams: extractRouteParams(leaf.routeId),
		fields: collectFieldsForEntry(leaf.pagePath as string, libDir, cache, allVisited)
	});

	const seen = new Set<string>();
	for (const scope of scopes) {
		const owned = scope.ownedParams.filter((p) => !seen.has(p));
		scope.ownedParams = owned;
		for (const p of owned) seen.add(p);
	}

	return scopes;
};
