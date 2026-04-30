import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc, type Plugin, type ResolvedConfig } from 'vite';
import { setPageCmsModules } from './build-state.js';
import {
	buildManifest,
	type BuildManifestResult,
	type ExternalCmsComponentSpec,
	type ImportResolver
} from './manifest.js';
import {
	PAGE_CMS_VIRTUAL_PREFIX,
	buildPagesModuleSource,
	hasGenerateEntriesImport,
	injectGenerateEntriesRouteId,
	injectScopeInstall,
	parsePageCmsIndex
} from './transforms.js';

export type CmsPluginOptions = {
	/** Defaults to `src/routes` (relative to Vite root). */
	routesDir?: string;
	/** Defaults to `src/lib` (relative to Vite root). */
	libDir?: string;
	/**
	 * Third-party CMS components beyond the auto-discovered ones in
	 * `<libDir>/components/cms/` and the @velastack/cms package itself.
	 */
	components?: ExternalCmsComponentSpec[];
	/**
	 * Bare-specifier sources whose `.svelte` imports the walker should follow.
	 * Strings match `source === pattern || source.startsWith(pattern + '/')`.
	 * Auto-populated with every entry from `components`.
	 */
	traverse?: (string | RegExp)[];
};

const VIRTUAL_ID = 'virtual:vela-cms/manifest';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

const PAGES_VIRTUAL_ID = 'virtual:vela-cms/pages';
const PAGES_RESOLVED_VIRTUAL_ID = '\0' + PAGES_VIRTUAL_ID;

/**
 * Walk up from `start` looking for the nearest `package.json`. Returns the
 * directory containing it, or `null` if none is found before the filesystem
 * root.
 */
const findPackageRoot = (start: string): string | null => {
	let cur = start;
	while (true) {
		if (existsSync(resolve(cur, 'package.json'))) return cur;
		const parent = dirname(cur);
		if (parent === cur) return null;
		cur = parent;
	}
};

/** Returns `dir` if `<dir>/package.json` declares the given name, else `null`. */
const matchPackageName = (dir: string, name: string): string | null => {
	try {
		const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf-8'));
		return pkg && pkg.name === name ? dir : null;
	} catch {
		return null;
	}
};

/**
 * Vite plugin that scans SvelteKit route files, walks the static Svelte
 * import graph from each entrypoint, and exposes a `cmsManifest` constant via
 * `virtual:vela-cms/manifest`. Auto-injects `setContext(CMS_SCOPE, …)` into
 * every `+layout.svelte` / `+page.svelte` so authors don't pass scope
 * manually.
 *
 * Auto-discovers CMS components from:
 *   - `<libDir>/components/cms/*.svelte` (default imports)
 *   - `<libDir>/components/cms/index.{ts,js}` (every named export)
 *   - any import resolving inside the @velastack/cms package itself
 *
 * Use `components` to declare third-party CMS component packs. Use `traverse`
 * to walk into wrapper packages whose `.svelte` files contain CMS usages but
 * aren't themselves CMS components.
 */
export const cms = (options: CmsPluginOptions = {}): Plugin => {
	let routesDir = '';
	let libDir = '';
	let viteRoot = '';
	let config: ResolvedConfig;

	// The plugin ships inside the @velastack/cms package. From its own file
	// location we can identify the package's repo (in dev) or installed (in
	// node_modules) root so we can classify any import resolving inside that
	// subtree.
	const ownPackageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

	let cached: Promise<BuildManifestResult> | null = null;
	let cachedSync: BuildManifestResult | null = null;
	let velacmsRoots: string[] | null = null;

	const ensureManifest = (resolver: ImportResolver): Promise<BuildManifestResult> => {
		if (cached) return cached;
		cached = (async () => {
			// Resolve @velastack/cms package roots once: the plugin's own
			// location plus (if installed elsewhere) the consumer-resolved
			// package.
			if (velacmsRoots === null) {
				const roots = new Set<string>();
				if (ownPackageRoot) roots.add(ownPackageRoot);
				try {
					const resolved = await resolver('@velastack/cms', undefined);
					if (resolved) {
						const dir = findPackageRoot(dirname(resolved));
						if (dir && matchPackageName(dir, '@velastack/cms')) roots.add(dir);
					}
				} catch {
					// Swallow — self-resolution is best-effort.
				}
				velacmsRoots = [...roots];
			}

			const result = await buildManifest({
				routesDir,
				libDir,
				velacmsRoots,
				components: options.components,
				traverse: options.traverse,
				resolveExternal: resolver
			});
			cachedSync = result;
			setPageCmsModules(result.pageCmsModules);
			return result;
		})();
		return cached;
	};

	type RollupResolver = (
		id: string,
		importer?: string,
		opts?: { skipSelf?: boolean }
	) => Promise<{ id: string } | null>;

	const makeResolver = (ctx: { resolve: RollupResolver }): ImportResolver => {
		return async (source, importer) => {
			try {
				const r = await ctx.resolve(source, importer ?? viteRoot, { skipSelf: true });
				return r?.id ?? null;
			} catch {
				return null;
			}
		};
	};

	return {
		name: '@velastack/cms',
		enforce: 'pre',

		configResolved(resolved) {
			config = resolved;
			viteRoot = config.root;
			routesDir = resolve(config.root, options.routesDir ?? 'src/routes');
			libDir = resolve(config.root, options.libDir ?? 'src/lib');
		},

		buildStart() {
			cached = null;
			cachedSync = null;
			velacmsRoots = null;
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
			if (id === PAGES_VIRTUAL_ID) return PAGES_RESOLVED_VIRTUAL_ID;
			if (id.startsWith(PAGE_CMS_VIRTUAL_PREFIX)) return '\0' + id;
		},

		async load(id) {
			if (id === RESOLVED_VIRTUAL_ID) {
				const result = await ensureManifest(
					makeResolver(this as unknown as { resolve: RollupResolver })
				);
				for (const f of result.visitedFiles) this.addWatchFile(f);
				// No `addWatchFile(routesDir)` — Vite's import-analysis treats
				// every `addWatchFile` entry as an import and tries to resolve
				// it (node.js:27797), and a directory path doesn't resolve.
				// New files added under `routesDir` are picked up by Vite's
				// project-root watcher and routed through `handleHotUpdate`.
				return `export const cmsManifest = ${JSON.stringify(result.manifest)};\n`;
			}
			if (id === PAGES_RESOLVED_VIRTUAL_ID) {
				const result = await ensureManifest(
					makeResolver(this as unknown as { resolve: RollupResolver })
				);
				// No `addWatchFile` for `m.path` — paths inside SvelteKit route
				// groups (e.g. `(marketing)`) trip Vite's module-graph URL
				// normalization. HMR is handled by `handleHotUpdate` below,
				// which receives every change in `routesDir` via SvelteKit's
				// existing watcher.
				return buildPagesModuleSource(result.pageCmsModules);
			}
			const idx = parsePageCmsIndex(id);
			if (idx !== null) {
				const result = await ensureManifest(
					makeResolver(this as unknown as { resolve: RollupResolver })
				);
				const m = result.pageCmsModules[idx];
				if (!m) return null;
				// `addWatchFile(m.path)` is intentionally omitted — see the
				// comment in the pages-module branch.
				//
				// Compile TS → JS ourselves: Vite's built-in TS transform
				// filters by file extension, and `\0`-prefixed virtual ids
				// don't match. Without this step, TS-only syntax in
				// `page.cms.ts` (e.g. `import { type X } from '…'`,
				// `satisfies T`) reaches the browser parser and fails with
				// "missing '}' after module specifier list".
				const source = readFileSync(m.path, 'utf-8');
				const transformed = await transformWithOxc(source, m.path, {
					lang: 'ts',
					sourcemap: true
				});
				return { code: transformed.code, map: transformed.map };
			}
		},

		async transform(code, id) {
			// Skip vite-plugin-svelte's derived sub-modules
			// (`?svelte&type=style&lang.css`, etc.) — only transform the original
			// route source.
			if (id.includes('?')) return;
			if (!id.startsWith(routesDir + '/')) return;
			const result = await ensureManifest(
				makeResolver(this as unknown as { resolve: RollupResolver })
			);

			if (id.endsWith('.svelte')) {
				const info = result.scopeByEntryPath.get(id);
				if (!info) return;
				return { code: injectScopeInstall(code, info, id), map: null };
			}

			if (id.endsWith('+page.ts') || id.endsWith('+page.server.ts')) {
				const routeId = result.routeIdByScriptPath.get(id);
				if (!routeId) return;
				if (!hasGenerateEntriesImport(code)) return;
				const next = injectGenerateEntriesRouteId(code, routeId);
				if (next === code) return;
				return { code: next, map: null };
			}
		},

		handleHotUpdate({ file, server }) {
			const isSvelte = file.endsWith('.svelte');
			const isRouteScript = file.endsWith('+page.ts') || file.endsWith('+page.server.ts');
			const isPageCms = file.endsWith('page.cms.ts');
			if (!isSvelte && !isRouteScript && !isPageCms) return;
			const inGraph = cachedSync?.visitedFiles.includes(file) ?? false;
			const inRoutes = file.startsWith(routesDir + '/');
			// Conservatively invalidate when we don't yet know the graph.
			if (cachedSync && !inGraph && !inRoutes && !isPageCms) return;

			// Capture the synthetic page-cms ids that point at this file before
			// we drop the manifest cache, so we can invalidate exactly those
			// per-file virtual modules along with the aggregate.
			const affectedPageCmsIds: string[] = [];
			if (isPageCms && cachedSync) {
				cachedSync.pageCmsModules.forEach((m, i) => {
					if (m.path === file) {
						affectedPageCmsIds.push('\0' + PAGE_CMS_VIRTUAL_PREFIX + i);
					}
				});
			}

			cached = null;
			cachedSync = null;
			velacmsRoots = null;

			const manifestMod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
			if (manifestMod) server.moduleGraph.invalidateModule(manifestMod);
			const pagesMod = server.moduleGraph.getModuleById(PAGES_RESOLVED_VIRTUAL_ID);
			if (pagesMod) server.moduleGraph.invalidateModule(pagesMod);
			for (const syntheticId of affectedPageCmsIds) {
				const mod = server.moduleGraph.getModuleById(syntheticId);
				if (mod) server.moduleGraph.invalidateModule(mod);
			}
		}
	};
};

export type { CmsManifest, CmsManifestScope, ExternalCmsComponentSpec } from './manifest.js';
