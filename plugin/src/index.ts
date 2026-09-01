import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc, type Plugin, type ResolvedConfig } from 'vite';
import { setPageCmsModules } from './build-state.js';
import {
	buildManifest,
	type BuildManifestResult,
	type CmsManifest,
	type ExternalCmsComponentSpec,
	type ImportResolver
} from './manifest.js';
import { deriveUploadsBase, downloadMedia, extractMediaUrls } from './media.js';
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
	/**
	 * CMS API endpoint, same shape as `apiAdapter`'s. e.g.
	 * `'https://cms.example.com/v1/projects/p1/cms'`. When set, `vite build`
	 * downloads every media file referenced by published content into
	 * `mediaDir`, and `apiAdapter` rewrites URLs in fetched content from
	 * `<origin>/uploads/<file>` (or `/uploads/<file>`) to
	 * `<mediaPrefix>/<file>` so prerendered output references local paths.
	 * Omit (or use `mockAdapter`) to opt out — the build steps become no-ops.
	 */
	endpoint?: string;
	/**
	 * BCP-47 locales to walk during media discovery. Mirror this with
	 * `createCms({ locales })`. Defaults to `['en']`.
	 */
	locales?: string[];
	/** Local directory (relative to Vite root) to download media into. Defaults to `'static/cms-media'`. */
	mediaDir?: string;
	/** URL prefix used in rewritten content. Defaults to `'/cms-media'`. */
	mediaPrefix?: string;
};

const VIRTUAL_ID = 'virtual:vela-cms/manifest';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

const PAGES_VIRTUAL_ID = 'virtual:vela-cms/pages';
const PAGES_RESOLVED_VIRTUAL_ID = '\0' + PAGES_VIRTUAL_ID;

const BUILD_CONFIG_VIRTUAL_ID = 'virtual:vela-cms/build-config';
const BUILD_CONFIG_RESOLVED_VIRTUAL_ID = '\0' + BUILD_CONFIG_VIRTUAL_ID;

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
 * Cache for the media-discovery + download pass, deduplicating it across
 * the two `Vite.build()` invocations SvelteKit makes per `npm run build`
 * (one for the client environment, one for SSR).
 *
 * Why `globalThis` rather than module or closure scope: SvelteKit's two
 * Vite invocations both run on the main thread (same pid, no
 * worker_threads), but Vite drops its in-memory module cache between
 * them, so the plugin's source file is re-evaluated and any
 * module-/closure-scoped state resets. `globalThis` is the one place
 * that survives the module reload while still being process-local — a
 * fresh `npm run build` in a new process gets a fresh `globalThis` and
 * re-runs the discovery.
 *
 * Keyed by endpoint so a project using two `cms({ endpoint })` calls
 * with different endpoints (rare) doesn't collide.
 */
type MediaPassCache = Map<string, Promise<void>>;
const MEDIA_PASS_CACHE_KEY = Symbol.for('@velastack/cms.mediaPassCache');
const getMediaPassCache = (): MediaPassCache => {
	const g = globalThis as Record<symbol, unknown>;
	let cache = g[MEDIA_PASS_CACHE_KEY] as MediaPassCache | undefined;
	if (!cache) {
		cache = new Map();
		g[MEDIA_PASS_CACHE_KEY] = cache;
	}
	return cache;
};

type PagesResponse = {
	routes: Array<{
		routeId: string;
		entries: Array<{
			params: Record<string, string>;
			isDraft?: boolean;
			isDeletePending?: boolean;
			redirectTo?: string;
			gone?: boolean;
			metadata?: Record<string, unknown>;
		}>;
	}>;
};

type DocsResponse =
	{ contents: Record<string, unknown> } | { kind: 'gone' } | { kind: 'redirect'; to: string };

/**
 * Walk the project's published content over HTTP to find every media URL
 * referenced. Issues one `/pages?locale=L` per locale to enumerate
 * (routeId, params) entries, then one `/docs` per (scope × entry × locale)
 * tuple — deduped so layout-kind scopes (no owned params) are fetched once
 * per locale even when reachable from many pages. Drafts, tombstoned and
 * redirected entries contribute no media (they aren't part of the public
 * payload). Failures during discovery are warned about but never throw —
 * a build with one offline scope shouldn't fail outright.
 */
const discoverProjectMedia = async ({
	endpoint,
	locales,
	manifest,
	uploadsBase
}: {
	endpoint: string;
	locales: string[];
	manifest: CmsManifest;
	uploadsBase: string;
}): Promise<Set<string>> => {
	const found = new Set<string>();
	const fetchedDocs = new Set<string>();
	const docFetches: Array<Promise<void>> = [];

	const queueDocFetch = (
		kind: 'page' | 'layout',
		routeId: string,
		params: Record<string, string>,
		locale: string
	) => {
		const paramsJson = JSON.stringify(params);
		const cacheKey = `${kind}|${routeId}|${paramsJson}|${locale}`;
		if (fetchedDocs.has(cacheKey)) return;
		fetchedDocs.add(cacheKey);
		const qs = new URLSearchParams({ kind, routeId, params: paramsJson, locale }).toString();
		docFetches.push(
			fetch(`${endpoint}/docs?${qs}`)
				.then(async (res) => {
					if (res.status === 404 || !res.ok) return;
					const body = (await res.json()) as DocsResponse;
					if (!('contents' in body)) return;
					for (const url of extractMediaUrls(body.contents, uploadsBase)) {
						found.add(url);
					}
				})
				.catch(() => {
					// Single-scope failures are non-fatal — log nothing here;
					// the worst-case impact is a missed media file we'd have to
					// fall back to backend-served. Caller logs the high-level
					// download summary.
				})
		);
	};

	for (const locale of locales) {
		let pages: PagesResponse;
		try {
			const res = await fetch(`${endpoint}/pages?locale=${encodeURIComponent(locale)}`);
			if (!res.ok) continue;
			pages = (await res.json()) as PagesResponse;
		} catch {
			continue;
		}

		for (const route of pages.routes) {
			const m = manifest.routes[route.routeId];
			if (!m) continue;

			// Entry metadata can include images for index/listing pages —
			// scoop those without an extra request.
			for (const entry of route.entries) {
				if (entry.isDraft || entry.isDeletePending || entry.gone || entry.redirectTo) {
					continue;
				}
				if (entry.metadata) {
					for (const url of extractMediaUrls(entry.metadata, uploadsBase)) {
						found.add(url);
					}
				}
			}

			const publishableEntries = route.entries.filter(
				(e) => !e.isDraft && !e.isDeletePending && !e.gone && !e.redirectTo
			);

			// A route with no owned params still resolves once with `{}`.
			const fanOut: Array<Record<string, string>> =
				publishableEntries.length > 0 ? publishableEntries.map((e) => e.params) : [{}];

			for (const params of fanOut) {
				for (const scope of m.scopes) {
					const scopeParams: Record<string, string> = {};
					for (const p of scope.ownedParams) {
						if (params[p] !== undefined) scopeParams[p] = params[p];
					}
					queueDocFetch(scope.kind, scope.routeId, scopeParams, locale);
				}
			}
		}
	}

	await Promise.all(docFetches);
	return found;
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

		async buildStart() {
			cached = null;
			cachedSync = null;
			velacmsRoots = null;

			// Media discovery + download is only meaningful for `vite build`.
			// In dev (`vite serve`), images load from the backend as today.
			if (config.command !== 'build') return;
			if (!options.endpoint) return;

			const endpoint = options.endpoint.replace(/\/$/, '');
			const resolver = makeResolver(this as unknown as { resolve: RollupResolver });
			const locales = options.locales ?? ['en'];
			const uploadsBase = deriveUploadsBase(endpoint);
			const mediaDir = resolve(viteRoot, options.mediaDir ?? 'static/cms-media');
			const logger = config.logger;

			// A root-relative endpoint (`cms({ endpoint: '/cms' })`) is the
			// same-origin, single-tenant setup: uploads are served by the app
			// itself, so there is nothing to pre-download and no origin to
			// download it from. Prerendered pages reference `/uploads/<file>`
			// and the app serves it at runtime.
			if (uploadsBase === null) return;

			const cache = getMediaPassCache();
			let pass = cache.get(endpoint);
			if (!pass) {
				pass = (async () => {
					const result = await ensureManifest(resolver);

					const filenames = await discoverProjectMedia({
						endpoint,
						locales,
						manifest: result.manifest,
						uploadsBase
					});

					if (filenames.size === 0) return;

					const dl = await downloadMedia(filenames, uploadsBase, mediaDir);
					const total = dl.written + dl.skipped;
					logger.info(
						`@velastack/cms: media — discovered ${filenames.size}, wrote ${dl.written}, skipped ${dl.skipped}${
							dl.failed.length ? `, failed ${dl.failed.length}` : ''
						} (of ${total})`
					);
					for (const f of dl.failed) {
						logger.warn(`@velastack/cms: media download failed for ${f.filename}: ${f.reason}`);
					}
				})();
				cache.set(endpoint, pass);
			}
			await pass;
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
			if (id === PAGES_VIRTUAL_ID) return PAGES_RESOLVED_VIRTUAL_ID;
			if (id === BUILD_CONFIG_VIRTUAL_ID) return BUILD_CONFIG_RESOLVED_VIRTUAL_ID;
			if (id.startsWith(PAGE_CMS_VIRTUAL_PREFIX)) return '\0' + id;
		},

		async load(id) {
			if (id === BUILD_CONFIG_RESOLVED_VIRTUAL_ID) {
				// Inlined into the bundle so the apiAdapter reads it during
				// SvelteKit prerender — even when prerender runs in a worker
				// thread that doesn't share `globalThis` with the plugin
				// process. When no `endpoint` is configured, `media` is null
				// and the rewrite is a pass-through.
				const media = options.endpoint
					? {
							uploadsBase: deriveUploadsBase(options.endpoint),
							mediaPrefix: options.mediaPrefix ?? '/cms-media'
						}
					: null;
				return `export const buildConfig = ${JSON.stringify({ media })};\n`;
			}
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
