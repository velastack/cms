import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
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
	/** Editable metadata field names. Present only for `kind === 'page'`. */
	metadata?: string[];
};

/**
 * Default page-metadata fields exposed to the editor. These are intentionally
 * the flat top-level keys of `MetaTagsProps` so they map directly to
 * `definePageMetaTags(...)` without nested transformation.
 */
const DEFAULT_PAGE_METADATA: string[] = ['title', 'description', 'canonical', 'robots'];

export type CmsManifest = {
	version: 1;
	routes: Record<string, { scopes: CmsManifestScope[] }>;
};

/**
 * Spec for an external CMS component pack. Either lists named exports that are
 * CMS components, or marks a single-file source as a default-export CMS
 * component. Auto-registers `source` for traversal.
 */
export type ExternalCmsComponentSpec =
	| { source: string; names: string[] }
	| { source: string; default: true };

/**
 * Resolve a bare specifier to an absolute file path using the host bundler's
 * resolver (Rollup `this.resolve` or equivalent). May return `null` if the
 * specifier can't be resolved.
 */
export type ImportResolver = (
	source: string,
	importer: string | undefined
) => Promise<string | null>;

export type BuildManifestOptions = {
	routesDir: string;
	libDir: string;
	/** Absolute paths whose subtrees identify the velacms package. */
	velacmsRoots?: string[];
	/** Third-party CMS components recognized by the plugin. */
	components?: ExternalCmsComponentSpec[];
	/** Bare-specifier sources whose `.svelte` imports the walker should follow. */
	traverse?: (string | RegExp)[];
	/** Bare-specifier resolver (Rollup `this.resolve` etc.). */
	resolveExternal?: ImportResolver;
};

export type ScopeInfo = Pick<CmsManifestScope, 'scopeId' | 'kind' | 'routeId' | 'ownedParams'>;

export type BuildManifestResult = {
	manifest: CmsManifest;
	visitedFiles: string[];
	/** Lookup from absolute route entrypoint path to its scope info. */
	scopeByEntryPath: Map<string, ScopeInfo>;
	/**
	 * Lookup from absolute `+page.ts` / `+page.server.ts` path to the leaf
	 * route id. Used by the plugin to inject `routeId` into zero-arg
	 * `generateEntries()` calls.
	 */
	routeIdByScriptPath: Map<string, string>;
};

const tryStatFile = (path: string): boolean => {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
};

/**
 * Synchronous resolver for `$lib/...` and relative specifiers — the in-tree
 * paths the plugin handles without any bundler context. Returns `null` for
 * bare specifiers; callers fall through to the external resolver.
 */
const resolveLocal = (source: string, fromFile: string, libDir: string): string | null => {
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
	const rel = path.slice(dir.length + 1);
	// Any .svelte file directly under <libDir>/components/cms/ — no allowlist of names.
	return rel.length > 0 && !rel.includes(sep) && rel.endsWith('.svelte');
};

const isInVelacmsPackage = (path: string, roots: string[]): boolean => {
	for (const root of roots) {
		const prefix = root.endsWith(sep) ? root : root + sep;
		if (path === root || path.startsWith(prefix)) return true;
	}
	return false;
};

const matchTraverse = (source: string, patterns: (string | RegExp)[]): boolean => {
	for (const pattern of patterns) {
		if (typeof pattern === 'string') {
			if (source === pattern || source.startsWith(pattern + '/')) return true;
		} else if (pattern.test(source)) {
			return true;
		}
	}
	return false;
};

/**
 * Try local resolution first, then fall back to the external resolver if the
 * source matches a `traverse` pattern. Returns `null` when neither succeeds.
 */
const resolveOrExternal = async (
	source: string,
	fromFile: string,
	libDir: string,
	resolveExternal: ImportResolver | undefined,
	traversePatterns: (string | RegExp)[]
): Promise<string | null> => {
	const local = resolveLocal(source, fromFile, libDir);
	if (local) return local;
	if (!resolveExternal) return null;
	if (!matchTraverse(source, traversePatterns)) return null;
	return resolveExternal(source, fromFile);
};

/**
 * Walk one entrypoint's static import graph (only `.svelte` files), collecting
 * field names referenced by CMS component usages. Classification iterates
 * three rule sets per import: in-tree barrel/file, velacms package, then
 * user-supplied spec map.
 */
const collectFieldsForEntry = async (
	entry: string,
	options: {
		libDir: string;
		velacmsRoots: string[];
		specByResolvedPath: Map<string, ExternalCmsComponentSpec>;
		specBySource: Map<string, ExternalCmsComponentSpec>;
		traversePatterns: (string | RegExp)[];
		resolveExternal: ImportResolver | undefined;
		cache: Map<string, ParsedSvelte>;
		allVisited: Set<string>;
	}
): Promise<string[]> => {
	const {
		libDir,
		velacmsRoots,
		specByResolvedPath,
		specBySource,
		traversePatterns,
		resolveExternal,
		cache,
		allVisited
	} = options;

	const visited = new Set<string>();
	const fields: string[] = [];

	const classify = (
		spec: ExternalCmsComponentSpec,
		bindings: ParsedSvelte['imports'][number]['bindings'],
		cmsLocals: Set<string>
	): void => {
		if ('default' in spec && spec.default) {
			for (const b of bindings) {
				if (b.imported === 'default') cmsLocals.add(b.local);
			}
		} else if ('names' in spec) {
			const set = new Set(spec.names);
			for (const b of bindings) {
				if (b.imported !== 'default' && set.has(b.imported)) cmsLocals.add(b.local);
			}
		}
	};

	const walk = async (filePath: string): Promise<void> => {
		if (visited.has(filePath)) return;
		visited.add(filePath);
		allVisited.add(filePath);

		let parsed = cache.get(filePath);
		if (!parsed) {
			parsed = parseSvelteFile(filePath);
			cache.set(filePath, parsed);
		}

		const resolvedByImport = new Map<number, string | null>();
		for (let i = 0; i < parsed.imports.length; i++) {
			const imp = parsed.imports[i];
			resolvedByImport.set(
				i,
				await resolveOrExternal(imp.source, filePath, libDir, resolveExternal, traversePatterns)
			);
		}

		const cmsLocals = new Set<string>();
		for (let i = 0; i < parsed.imports.length; i++) {
			const imp = parsed.imports[i];
			const resolved = resolvedByImport.get(i) ?? null;

			// Rule 1 + 2: in-tree barrel & files under <libDir>/components/cms/.
			if (resolved && isCmsBarrelPath(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (b.imported !== 'default') cmsLocals.add(b.local);
				}
				continue;
			}
			if (resolved && isCmsComponentFile(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (b.imported === 'default') cmsLocals.add(b.local);
				}
				continue;
			}

			// Rule 3: any import resolving inside the velacms package itself.
			if (resolved && velacmsRoots.length > 0 && isInVelacmsPackage(resolved, velacmsRoots)) {
				for (const b of imp.bindings) {
					if (b.imported === 'default') {
						if (resolved.endsWith('.svelte')) cmsLocals.add(b.local);
					} else {
						cmsLocals.add(b.local);
					}
				}
				continue;
			}

			// Rule 4: user-supplied spec — match by resolved path first, then raw source.
			let spec = resolved ? specByResolvedPath.get(resolved) : undefined;
			if (!spec) spec = specBySource.get(imp.source);
			if (spec) classify(spec, imp.bindings, cmsLocals);
		}

		for (const usage of parsed.componentUsages) {
			if (!cmsLocals.has(usage.componentName)) continue;
			if (usage.hasValueAttr || !usage.fieldName) continue;
			fields.push(usage.fieldName);
		}

		for (let i = 0; i < parsed.imports.length; i++) {
			const resolved = resolvedByImport.get(i) ?? null;
			if (resolved && resolved.endsWith('.svelte')) await walk(resolved);
		}
	};

	await walk(entry);
	return [...new Set(fields)];
};

const buildScopeChain = async (
	leaf: RouteNode,
	byRouteId: Map<string, RouteNode>,
	collectOptions: Parameters<typeof collectFieldsForEntry>[1]
): Promise<CmsManifestScope[]> => {
	const scopes: CmsManifestScope[] = [];
	for (const dir of ancestorRouteIds(leaf.routeId)) {
		const dirNode = byRouteId.get(dir);
		if (!dirNode?.layoutPath) continue;
		scopes.push({
			scopeId: 'layout:' + dir,
			kind: 'layout',
			routeId: dir,
			ownedParams: extractRouteParams(dir),
			fields: await collectFieldsForEntry(dirNode.layoutPath, collectOptions)
		});
	}

	scopes.push({
		scopeId: 'page:' + leaf.routeId,
		kind: 'page',
		routeId: leaf.routeId,
		ownedParams: extractRouteParams(leaf.routeId),
		fields: await collectFieldsForEntry(leaf.pagePath as string, collectOptions),
		metadata: DEFAULT_PAGE_METADATA
	});

	const seen = new Set<string>();
	for (const scope of scopes) {
		const owned = scope.ownedParams.filter((p) => !seen.has(p));
		scope.ownedParams = owned;
		for (const p of owned) seen.add(p);
	}

	return scopes;
};

export const buildManifest = async (
	options: BuildManifestOptions
): Promise<BuildManifestResult> => {
	const {
		routesDir,
		libDir,
		velacmsRoots = [],
		components = [],
		traverse = [],
		resolveExternal
	} = options;

	const nodes = discoverRoutes(routesDir);
	const byRouteId = new Map(nodes.map((n) => [n.routeId, n]));
	const cache = new Map<string, ParsedSvelte>();
	const visitedFiles = new Set<string>();
	const scopeByEntryPath = new Map<string, ScopeInfo>();
	const routeIdByScriptPath = new Map<string, string>();

	// Auto-register every `components[].source` for traversal so users don't
	// have to repeat themselves.
	const traversePatterns: (string | RegExp)[] = [...traverse, ...components.map((c) => c.source)];

	// Pre-resolve user spec sources once. Build two lookup maps: by canonical
	// resolved path (preferred) and by raw source string (fallback).
	const specByResolvedPath = new Map<string, ExternalCmsComponentSpec>();
	const specBySource = new Map<string, ExternalCmsComponentSpec>();
	for (const spec of components) {
		specBySource.set(spec.source, spec);
		if (resolveExternal) {
			const resolved = await resolveExternal(spec.source, undefined);
			if (resolved) specByResolvedPath.set(resolved, spec);
		}
	}

	const collectOptions: Parameters<typeof collectFieldsForEntry>[1] = {
		libDir,
		velacmsRoots,
		specByResolvedPath,
		specBySource,
		traversePatterns,
		resolveExternal,
		cache,
		allVisited: visitedFiles
	};

	const routes: CmsManifest['routes'] = {};
	for (const node of nodes) {
		if (!node.pagePath) continue;
		const scopes = await buildScopeChain(node, byRouteId, collectOptions);
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

		if (node.pageScriptPath) routeIdByScriptPath.set(node.pageScriptPath, node.routeId);
		if (node.pageServerScriptPath)
			routeIdByScriptPath.set(node.pageServerScriptPath, node.routeId);
	}

	return {
		manifest: { version: 1, routes },
		visitedFiles: [...visitedFiles],
		scopeByEntryPath,
		routeIdByScriptPath
	};
};
