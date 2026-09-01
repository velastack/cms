import { parseSvelteSource } from './parse-svelte.js';
import type { ScopeInfo } from './manifest.js';

/**
 * Per-`page.cms.ts` synthetic virtual id prefix. We can't import the files
 * via their on-disk paths from inside a virtual module: SvelteKit route
 * groups (e.g. `(marketing)`) trip Vite's `import-analysis` `normalizeUrl`
 * — `/path/(group)/foo` and `/@fs/path/(group)/foo` both fail with
 * `Failed to resolve import "/path"`. Routing the imports through
 * paren-free synthetic ids and letting the plugin's `load` hook return
 * the file source directly avoids URL normalization entirely.
 */
export const PAGE_CMS_VIRTUAL_PREFIX = 'virtual:vela-cms/page-cms-';

/**
 * Generate the source for `virtual:vela-cms/pages`. Imports each
 * `page.cms.ts` module via a paren-free synthetic id and aggregates them
 * keyed by `routeId`. The `routeId` is added to each config so consumers
 * (the AdminBar) don't have to thread it separately.
 */
export const buildPagesModuleSource = (
	modules: Array<{ routeId: string; path: string }>
): string => {
	if (modules.length === 0) {
		return 'export const pages = /* @__PURE__ */ Object.freeze({});\n';
	}
	const lines: string[] = [];
	modules.forEach((_m, i) => {
		lines.push(`import _${i} from ${JSON.stringify(PAGE_CMS_VIRTUAL_PREFIX + i)};`);
	});
	lines.push('export const pages = {');
	modules.forEach((m, i) => {
		lines.push(
			`	${JSON.stringify(m.routeId)}: { ..._${i}, routeId: ${JSON.stringify(m.routeId)} },`
		);
	});
	lines.push('};');
	return lines.join('\n') + '\n';
};

/** Decode the index from a synthetic page-cms id, or `null` if not one. */
export const parsePageCmsIndex = (id: string): number | null => {
	const prefix = '\0' + PAGE_CMS_VIRTUAL_PREFIX;
	if (!id.startsWith(prefix)) return null;
	const n = Number(id.slice(prefix.length));
	return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Where a transformed route file imports `installCmsScope` from. */
export const INSTALL_IMPORT_SOURCE = '@velastack/cms';

/**
 * The package's own showcase routes are the one place the public entry is the
 * wrong import: there `$lib` *is* this package's source, and the package name
 * would resolve to a stale `dist/` or not at all. The plugin passes this when
 * the Vite root is the package itself. Every consumer gets the package name —
 * their `$lib` is their own `src/lib`, where this path does not exist.
 */
export const SELF_INSTALL_IMPORT_SOURCE = '$lib/components/cms/install-scope.svelte.js';

const buildInstallImport = (source: string): string =>
	`import { installCmsScope as __velaCmsInstallScope } from '${source}';\n`;

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
export const injectScopeInstall = (
	code: string,
	info: ScopeInfo,
	filename: string,
	importSource: string = INSTALL_IMPORT_SOURCE
): string => {
	const parsed = parseSvelteSource(code, filename);
	const importLine = buildInstallImport(importSource);
	const call = buildInstallCall(info);

	if (!parsed.instanceScript) {
		return `<script lang="ts">\n${importLine}${call}</script>\n${code}`;
	}

	const { contentStart, contentEnd } = parsed.instanceScript;
	const before = code.slice(0, contentStart);
	const scriptBody = code.slice(contentStart, contentEnd);
	const after = code.slice(contentEnd);
	return `${before}\n${importLine}${scriptBody}\n${call}${after}`;
};

/**
 * Quick scan for an `import { generateEntries[, …] } from '...'` binding.
 * The source module doesn't matter — typically the user re-exports
 * `generateEntries` from their own `$lib/cms.ts`. Returns true when the
 * file contains an `import { ... }` statement that names `generateEntries`
 * (with or without an alias), false otherwise.
 */
export const hasGenerateEntriesImport = (code: string): boolean => {
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
export const injectGenerateEntriesRouteId = (code: string, routeId: string): string => {
	// `generateEntries(\s*)` — only match when arg list is empty.
	const re = /\bgenerateEntries\s*\(\s*\)/g;
	const literal = `'${routeId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	return code.replace(re, `generateEntries(${literal})`);
};
