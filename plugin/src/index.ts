import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { buildManifest, type BuildManifestResult, type ScopeInfo } from './manifest.js';
import { parseSvelteSource } from './parse-svelte.js';

export type VelaCmsManifestPluginOptions = {
	/** Defaults to `src/routes` (relative to Vite root). */
	routesDir?: string;
	/** Defaults to `src/lib` (relative to Vite root). */
	libDir?: string;
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
 * file has no instance script, prepend one. The injected import is hoisted to
 * the top of the script body and the call is appended at the end so it runs
 * after any user-defined module-init code.
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
 * Vite plugin that scans SvelteKit route files, walks the static Svelte
 * import graph from each entrypoint, and exposes a `cmsManifest` constant via
 * `virtual:vela-cms/manifest`. Also auto-injects a `setContext(CMS_SCOPE, …)`
 * call into every `+layout.svelte` / `+page.svelte` so authors don't pass
 * scope manually.
 */
export const velaCmsManifest = (options: VelaCmsManifestPluginOptions = {}): Plugin => {
	let routesDir = '';
	let libDir = '';
	let config: ResolvedConfig;
	let cached: BuildManifestResult | null = null;

	const ensureManifest = (): BuildManifestResult => {
		if (!cached) cached = buildManifest({ routesDir, libDir });
		return cached;
	};

	return {
		name: 'vela-cms-manifest',
		enforce: 'pre',

		configResolved(resolved) {
			config = resolved;
			routesDir = resolve(config.root, options.routesDir ?? 'src/routes');
			libDir = resolve(config.root, options.libDir ?? 'src/lib');
		},

		buildStart() {
			cached = null;
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
		},

		load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) return;
			const result = ensureManifest();
			for (const f of result.visitedFiles) this.addWatchFile(f);
			this.addWatchFile(routesDir);
			return `export const cmsManifest = ${JSON.stringify(result.manifest)};\n`;
		},

		transform(code, id) {
			// Skip vite-plugin-svelte's derived sub-modules
			// (`?svelte&type=style&lang.css`, etc.) — only transform the original
			// route source.
			if (id.includes('?')) return;
			if (!id.endsWith('.svelte')) return;
			if (!id.startsWith(routesDir + '/')) return;
			const result = ensureManifest();
			const info = result.scopeByEntryPath.get(id);
			if (!info) return;
			return { code: injectScopeInstall(code, info, id), map: null };
		},

		handleHotUpdate({ file, server }) {
			if (!file.endsWith('.svelte')) return;
			if (!file.startsWith(routesDir) && !file.startsWith(libDir)) return;
			cached = null;
			const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
			if (mod) server.moduleGraph.invalidateModule(mod);
		}
	};
};

export type { CmsManifest, CmsManifestScope } from './manifest.js';
