import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { parseAstAsync } from 'vite';
import { parseSvelteFile, type ParsedSvelte } from './parse-svelte.js';
import {
	ancestorRouteIds,
	discoverRoutes,
	extractRouteParams,
	type RouteNode
} from './route-tree.js';

/**
 * One CMS component usage as recorded in the manifest: which value it reads
 * and which component type reads it, so a content manifest can be checked
 * against the template without parsing Svelte again.
 */
export type CmsManifestUsage = {
	/** The `name=` literal. */
	name: string;
	/** Canonical exported component name (`CmsText`, `CmsHours`, …). */
	component: string;
	/** Static `preset=` literal, for list presets. */
	preset?: string;
};

export type CmsManifestScope = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	ownedParams: string[];
	/**
	 * Lodash-style paths used by Cms* components in this scope. For pages the
	 * `metadata` branch shows up here too (e.g. `'metadata.title'`).
	 */
	fields: string[];
	/** The usages behind `fields`, with their component types. */
	usages: CmsManifestUsage[];
};

/** The root layout scope, addressed by `scope="root"`. */
export const ROOT_SCOPE_ID = 'layout:/';

/**
 * Default page-metadata paths surfaced to the editor when a route has no
 * explicit schema. Always live under the `metadata` branch. Mirrors
 * `DEFAULT_METADATA_SCHEMA` in `admin-bar/page-config.ts`.
 */
const DEFAULT_PAGE_METADATA_PATHS: string[] = [
	'metadata.title',
	'metadata.description',
	'metadata.ogTitle',
	'metadata.ogDescription',
	'metadata.ogImage',
	'metadata.twitterCard',
	'metadata.canonical',
	'metadata.noindex'
];

/** Bare specifiers that are this package: named imports are CMS components. */
export const isPackageSource = (source: string): boolean =>
	source === '@velastack/cms' || source.startsWith('@velastack/cms/');

/** Resolve a `scope=` attribute to a scope id. */
export const resolveScopeAttr = (scope: string): string => {
	if (scope === 'root') return ROOT_SCOPE_ID;
	return scope.includes(':') ? scope : `layout:${scope}`;
};

export type CmsManifestRoute = {
	scopes: CmsManifestScope[];
	/** Route ids referenced by `<CmsEntries routeId="…">` anywhere in this route's chain. */
	entriesRouteIds: string[];
};

export type CmsManifest = {
	version: 1;
	routes: Record<string, CmsManifestRoute>;
};

/**
 * Spec for an external CMS component pack. Either lists named exports that are
 * CMS components, or marks a single-file source as a default-export CMS
 * component. Auto-registers `source` for traversal.
 */
export type ExternalCmsComponentSpec =
	{ source: string; names: string[] } | { source: string; default: true };

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
	/**
	 * `page.cms.ts` files discovered during the route walk, paired with
	 * their leaf route id. Used by the `virtual:vela-cms/pages` virtual
	 * module to aggregate `definePage(...)` configs at runtime, and shared
	 * with the `@velastack/cms-static` adapter (via `build-state.js`) so it
	 * knows which routes are creatable without re-walking `src/routes/`.
	 */
	pageCmsModules: Array<{ routeId: string; path: string; creatable: boolean }>;
	/**
	 * Which scopes reach each visited `.svelte` file, leaf scope first. A
	 * shared component used from two layouts lists both. Fallback injection
	 * uses it to find the content tree a usage's value lives in.
	 */
	scopesByFile: Map<string, string[]>;
	/** Human-readable problems found during the walk: dynamic `name`s the
	 * manifest cannot record, `scope=` attributes naming a scope outside the
	 * route's chain. The plugin logs them; verify tooling can fail on them. */
	warnings: string[];
};

const tryStatFile = (path: string): boolean => {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
};

/**
 * Parse a `page.cms.ts` file and return whether its default export declares
 * `creatable: true`. Robust against `satisfies`/`as` type assertions and the
 * `definePage(...)` wrapper form. Returns `false` on parse failure or when
 * the export is shaped in a way we don't recognize — the static-adapter
 * post-pass treats `false` as "not in the manifest", which is the safe
 * default.
 */
const parsePageCmsCreatable = async (filePath: string): Promise<boolean> => {
	let source: string;
	try {
		source = readFileSync(filePath, 'utf-8');
	} catch {
		return false;
	}

	let program: { body: unknown[] };
	try {
		program = (await parseAstAsync(source, { lang: 'ts' })) as { body: unknown[] };
	} catch {
		return false;
	}

	const defaultExport = (program.body as Array<{ type: string }>).find(
		(n) => n.type === 'ExportDefaultDeclaration'
	) as { declaration: unknown } | undefined;
	if (!defaultExport) return false;

	type AnyNode = {
		type: string;
		expression?: AnyNode;
		arguments?: AnyNode[];
		properties?: Array<{
			type: string;
			key?: { type: string; name?: string; value?: unknown };
			value?: { type: string; value?: unknown };
		}>;
	};

	let expr = defaultExport.declaration as AnyNode;
	for (let i = 0; i < 8 && expr; i++) {
		if (
			expr.type === 'TSSatisfiesExpression' ||
			expr.type === 'TSAsExpression' ||
			expr.type === 'TSTypeAssertion' ||
			expr.type === 'ParenthesizedExpression'
		) {
			expr = expr.expression as AnyNode;
			continue;
		}
		if (expr.type === 'CallExpression' && expr.arguments && expr.arguments.length > 0) {
			expr = expr.arguments[0];
			continue;
		}
		break;
	}

	if (!expr || expr.type !== 'ObjectExpression' || !expr.properties) return false;

	for (const prop of expr.properties) {
		if (prop.type !== 'Property') continue;
		const k = prop.key;
		const isCreatableKey =
			(k?.type === 'Identifier' && k.name === 'creatable') ||
			(k?.type === 'Literal' && k.value === 'creatable');
		if (!isCreatableKey) continue;
		if (prop.value?.type === 'Literal' && prop.value.value === true) return true;
		return false;
	}
	return false;
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

type CollectedUsage = {
	name: string;
	component: string;
	/** Resolved target scope id from a `scope=` attribute, or `null`. */
	scope: string | null;
	preset: string | null;
};

type CollectedEntry = {
	usages: CollectedUsage[];
	entriesRouteIds: string[];
	warnings: string[];
	/** Every `.svelte` file reached from this entry, entry first. */
	files: string[];
};

/** Canonical component name of a default-imported `.svelte` file: its
 * basename (`CmsHours.svelte` → `CmsHours`), else the local binding. */
const componentNameOf = (resolved: string | null, local: string): string => {
	if (resolved && resolved.endsWith('.svelte')) return basename(resolved, '.svelte');
	return local;
};

const isCmsBarrelPath = (libDir: string, path: string): boolean => {
	const barrel = join(libDir, 'components', 'cms');
	return path === join(barrel, 'index.ts') || path === join(barrel, 'index.js') || path === barrel;
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
 * field names referenced by CMS component usages plus any `routeId=` literals
 * that `<CmsEntries>`-shaped components carry. Classification iterates three
 * rule sets per import: in-tree barrel/file, velacms package, then
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
): Promise<CollectedEntry> => {
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
	const usages: CollectedUsage[] = [];
	const entriesRouteIds: string[] = [];
	const warnings: string[] = [];

	const classify = (
		spec: ExternalCmsComponentSpec,
		bindings: ParsedSvelte['imports'][number]['bindings'],
		cmsLocals: Map<string, string>,
		resolved: string | null
	): void => {
		if ('default' in spec && spec.default) {
			for (const b of bindings) {
				if (b.imported === 'default') cmsLocals.set(b.local, componentNameOf(resolved, b.local));
			}
		} else if ('names' in spec) {
			const set = new Set(spec.names);
			for (const b of bindings) {
				if (b.imported !== 'default' && set.has(b.imported)) cmsLocals.set(b.local, b.imported);
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

		// Local binding → canonical component name.
		const cmsLocals = new Map<string, string>();
		for (let i = 0; i < parsed.imports.length; i++) {
			const imp = parsed.imports[i];
			const resolved = resolvedByImport.get(i) ?? null;

			// Rule 0: the package by name, whether or not the bundler resolved it.
			// Every named export is a component; the walk needs no resolver.
			if (isPackageSource(imp.source)) {
				for (const b of imp.bindings) {
					if (b.imported !== 'default') cmsLocals.set(b.local, b.imported);
				}
				continue;
			}

			// Rule 1 + 2: in-tree barrel & files under <libDir>/components/cms/.
			if (resolved && isCmsBarrelPath(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (b.imported !== 'default') cmsLocals.set(b.local, b.imported);
				}
				continue;
			}
			if (resolved && isCmsComponentFile(libDir, resolved)) {
				for (const b of imp.bindings) {
					if (b.imported === 'default') cmsLocals.set(b.local, componentNameOf(resolved, b.local));
				}
				continue;
			}

			// Rule 3: any import resolving inside the velacms package itself.
			if (resolved && velacmsRoots.length > 0 && isInVelacmsPackage(resolved, velacmsRoots)) {
				for (const b of imp.bindings) {
					if (b.imported === 'default') {
						if (resolved.endsWith('.svelte')) {
							cmsLocals.set(b.local, componentNameOf(resolved, b.local));
						}
					} else {
						cmsLocals.set(b.local, b.imported);
					}
				}
				continue;
			}

			// Rule 4: user-supplied spec — match by resolved path first, then raw source.
			let spec = resolved ? specByResolvedPath.get(resolved) : undefined;
			if (!spec) spec = specBySource.get(imp.source);
			if (spec) classify(spec, imp.bindings, cmsLocals, resolved);
		}

		for (const usage of parsed.componentUsages) {
			const component = cmsLocals.get(usage.componentName);
			if (!component) continue;
			if (usage.routeIdAttr) entriesRouteIds.push(usage.routeIdAttr);
			if (usage.hasValueAttr) continue;
			if (usage.dynamicName) {
				warnings.push(
					`${filePath}:${usage.line} <${usage.componentName}> has a dynamic name and is not recorded in the manifest`
				);
				continue;
			}
			if (!usage.fieldName) continue;
			usages.push({
				name: usage.fieldName,
				component,
				scope: usage.scopeAttr ? resolveScopeAttr(usage.scopeAttr) : null,
				preset: usage.presetAttr
			});
		}

		for (let i = 0; i < parsed.imports.length; i++) {
			const resolved = resolvedByImport.get(i) ?? null;
			if (resolved && resolved.endsWith('.svelte')) await walk(resolved);
		}
	};

	await walk(entry);
	return {
		usages,
		entriesRouteIds: [...new Set(entriesRouteIds)],
		warnings,
		files: [...visited]
	};
};

/** Dedupe usages by (name, component, preset), keeping first-seen order. */
const dedupeUsages = (usages: CollectedUsage[]): CmsManifestUsage[] => {
	const seen = new Set<string>();
	const out: CmsManifestUsage[] = [];
	for (const u of usages) {
		const key = `${u.name}|${u.component}|${u.preset ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(
			u.preset
				? { name: u.name, component: u.component, preset: u.preset }
				: { name: u.name, component: u.component }
		);
	}
	return out;
};

const buildScopeChain = async (
	leaf: RouteNode,
	byRouteId: Map<string, RouteNode>,
	collectOptions: Parameters<typeof collectFieldsForEntry>[1]
): Promise<{
	scopes: CmsManifestScope[];
	entriesRouteIds: string[];
	warnings: string[];
	filesByScope: Map<string, string[]>;
}> => {
	const scopes: CmsManifestScope[] = [];
	const entriesRouteIds: string[] = [];
	const warnings: string[] = [];
	const filesByScope = new Map<string, string[]>();
	// Usages routed by a `scope=` attribute, applied once every scope exists.
	const routed: Array<{ usage: CollectedUsage; from: string }> = [];
	const ownUsages = new Map<string, CollectedUsage[]>();

	const addScope = async (
		scopeId: string,
		kind: 'layout' | 'page',
		routeId: string,
		entry: string
	) => {
		const collected = await collectFieldsForEntry(entry, collectOptions);
		entriesRouteIds.push(...collected.entriesRouteIds);
		warnings.push(...collected.warnings);
		filesByScope.set(scopeId, collected.files);
		const own: CollectedUsage[] = [];
		for (const u of collected.usages) {
			if (u.scope && u.scope !== scopeId) routed.push({ usage: u, from: scopeId });
			else own.push(u);
		}
		ownUsages.set(scopeId, own);
		scopes.push({
			scopeId,
			kind,
			routeId,
			ownedParams: extractRouteParams(routeId),
			fields: [],
			usages: []
		});
	};

	for (const dir of ancestorRouteIds(leaf.routeId)) {
		const dirNode = byRouteId.get(dir);
		if (!dirNode?.layoutPath) continue;
		await addScope('layout:' + dir, 'layout', dir, dirNode.layoutPath);
	}
	await addScope('page:' + leaf.routeId, 'page', leaf.routeId, leaf.pagePath as string);

	for (const { usage, from } of routed) {
		const target = ownUsages.get(usage.scope as string);
		if (target) target.push(usage);
		else {
			warnings.push(
				`${leaf.routeId}: <${usage.component} name="${usage.name}" scope="${usage.scope}"> in ${from} addresses a scope outside this route's layout chain`
			);
		}
	}

	for (const scope of scopes) {
		scope.usages = dedupeUsages(ownUsages.get(scope.scopeId) ?? []);
		const fields = scope.usages.map((u) => u.name);
		scope.fields =
			scope.kind === 'page'
				? Array.from(new Set([...fields, ...DEFAULT_PAGE_METADATA_PATHS]))
				: Array.from(new Set(fields));
	}

	const seen = new Set<string>();
	for (const scope of scopes) {
		const owned = scope.ownedParams.filter((p) => !seen.has(p));
		scope.ownedParams = owned;
		for (const p of owned) seen.add(p);
	}

	return { scopes, entriesRouteIds: [...new Set(entriesRouteIds)], warnings, filesByScope };
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
	const pageCmsModules: BuildManifestResult['pageCmsModules'] = [];
	const scopesByFile = new Map<string, string[]>();
	const warnings = new Set<string>();
	for (const node of nodes) {
		if (!node.pagePath) continue;
		const chain = await buildScopeChain(node, byRouteId, collectOptions);
		const { scopes, entriesRouteIds } = chain;
		routes[node.routeId] = { scopes, entriesRouteIds };
		for (const w of chain.warnings) warnings.add(w);
		// Leaf first: a page's own value beats a layout's for a shared component.
		for (const scope of [...scopes].reverse()) {
			for (const file of chain.filesByScope.get(scope.scopeId) ?? []) {
				const list = scopesByFile.get(file) ?? [];
				if (!list.includes(scope.scopeId)) list.push(scope.scopeId);
				scopesByFile.set(file, list);
			}
		}

		// Index every entry path encountered while walking this leaf's chain so
		// the transform hook can look up scope info by file path. Layouts may be
		// indexed multiple times via different leaves — same scope, same entry,
		// so the writes are idempotent.
		for (const scope of scopes) {
			const entryNode = byRouteId.get(scope.routeId);
			const entryPath = scope.kind === 'layout' ? entryNode?.layoutPath : entryNode?.pagePath;
			if (!entryPath) continue;
			scopeByEntryPath.set(entryPath, {
				scopeId: scope.scopeId,
				kind: scope.kind,
				routeId: scope.routeId,
				ownedParams: scope.ownedParams
			});
		}

		if (node.pageScriptPath) routeIdByScriptPath.set(node.pageScriptPath, node.routeId);
		if (node.pageServerScriptPath) routeIdByScriptPath.set(node.pageServerScriptPath, node.routeId);
		if (node.pageCmsPath) {
			const creatable = await parsePageCmsCreatable(node.pageCmsPath);
			pageCmsModules.push({ routeId: node.routeId, path: node.pageCmsPath, creatable });
		}
	}

	return {
		manifest: { version: 1, routes },
		visitedFiles: [...visitedFiles],
		scopeByEntryPath,
		routeIdByScriptPath,
		pageCmsModules,
		scopesByFile,
		warnings: [...warnings]
	};
};
