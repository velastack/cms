import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import {
	buildManifest,
	type BuildManifestResult,
	type ExternalCmsComponentSpec,
	type ImportResolver,
	type ScopeInfo
} from './manifest.js';
import { parseSvelteSource } from './parse-svelte.js';

export type VelacmsPluginOptions = {
	/** Defaults to `src/routes` (relative to Vite root). */
	routesDir?: string;
	/** Defaults to `src/lib` (relative to Vite root). */
	libDir?: string;
	/**
	 * Third-party CMS components beyond the auto-discovered ones in
	 * `<libDir>/components/cms/` and the velacms package itself.
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

const INSTALL_IMPORT =
	"import { installCmsScope as __velaCmsInstallScope } from '$lib/components/cms/install-scope.svelte.js';\n";

const buildInstallCall = (info: ScopeInfo): string =>
	`__velaCmsInstallScope(${JSON.stringify({
		scopeId: info.scopeId,
		kind: info.kind,
		routeId: info.routeId,
		ownedParams: info.ownedParams
	})});\n`;

/**
 * Insert the install import + call into the file's instance `<script>`. If the
 * file has no instance script, prepend one.
 */
const injectScopeInstall = (code: string, info: ScopeInfo, filename: string): string => {
	const parsed = parseSvelteSource(code, filename);
	const call = buildInstallCall(info);

	if (!parsed.instanceScript) {
		return `<script lang="ts">\n${INSTALL_IMPORT}${call}</script>\n${code}`;
	}

	const { contentStart, contentEnd } = parsed.instanceScript;
	const before = code.slice(0, contentStart);
	const scriptBody = code.slice(contentStart, contentEnd);
	const after = code.slice(contentEnd);
	return `${before}\n${INSTALL_IMPORT}${scriptBody}\n${call}${after}`;
};

/**
 * Quick scan for an `import { generateEntries[, …] } from '...'` binding.
 * The source module doesn't matter — typically the user re-exports
 * `generateEntries` from their own `$lib/cms.ts`. Returns true when the
 * file contains an `import { ... }` statement that names `generateEntries`
 * (with or without an alias), false otherwise.
 */
const hasGenerateEntriesImport = (code: string): boolean => {
	// Match `import { ... } from '...'` (single- or double-quoted).
	const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(code)) !== null) {
		const bindings = m[1];
		// Each binding is `name` or `name as local`. Match `generateEntries`
		// as a whole word in the imported-name position.
		if (/(^|,|\s)generateEntries(\s|,|$|\s+as\s+)/.test(bindings)) return true;
	}
	return false;
};

/**
 * Rewrite zero-arg `generateEntries()` calls to `generateEntries('<routeId>')`.
 * Whitespace between the parens is allowed but no other content; explicit
 * forms (any argument) are left alone, preserving the opt-out.
 */
const injectGenerateEntriesRouteId = (code: string, routeId: string): string => {
	// `generateEntries(\s*)` — only match when arg list is empty.
	const re = /\bgenerateEntries\s*\(\s*\)/g;
	const literal = `'${routeId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	return code.replace(re, `generateEntries(${literal})`);
};

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
 *   - any import resolving inside the velacms package itself
 *
 * Use `components` to declare third-party CMS component packs. Use `traverse`
 * to walk into wrapper packages whose `.svelte` files contain CMS usages but
 * aren't themselves CMS components.
 */
export const velacms = (options: VelacmsPluginOptions = {}): Plugin => {
	let routesDir = '';
	let libDir = '';
	let viteRoot = '';
	let config: ResolvedConfig;

	// The plugin ships inside the velacms package. From its own file location we
	// can identify the package's repo (in dev) or installed (in node_modules)
	// root so we can classify any import resolving inside that subtree.
	const ownPackageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

	let cached: Promise<BuildManifestResult> | null = null;
	let cachedSync: BuildManifestResult | null = null;
	let velacmsRoots: string[] | null = null;

	const ensureManifest = (resolver: ImportResolver): Promise<BuildManifestResult> => {
		if (cached) return cached;
		cached = (async () => {
			// Resolve velacms package roots once: the plugin's own location plus
			// (if installed elsewhere) the consumer-resolved package.
			if (velacmsRoots === null) {
				const roots = new Set<string>();
				if (ownPackageRoot) roots.add(ownPackageRoot);
				try {
					const resolved = await resolver('velacms', undefined);
					if (resolved) {
						const dir = findPackageRoot(dirname(resolved));
						if (dir && matchPackageName(dir, 'velacms')) roots.add(dir);
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
		name: 'velacms',
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
		},

		async load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) return;
			const result = await ensureManifest(makeResolver(this as unknown as { resolve: RollupResolver }));
			for (const f of result.visitedFiles) this.addWatchFile(f);
			this.addWatchFile(routesDir);
			return `export const cmsManifest = ${JSON.stringify(result.manifest)};\n`;
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
			if (!isSvelte && !isRouteScript) return;
			const inGraph = cachedSync?.visitedFiles.includes(file) ?? false;
			const inRoutes = file.startsWith(routesDir + '/');
			// Conservatively invalidate when we don't yet know the graph.
			if (cachedSync && !inGraph && !inRoutes) return;
			cached = null;
			cachedSync = null;
			velacmsRoots = null;
			const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
			if (mod) server.moduleGraph.invalidateModule(mod);
		}
	};
};

export type {
	CmsManifest,
	CmsManifestScope,
	ExternalCmsComponentSpec
} from './manifest.js';
