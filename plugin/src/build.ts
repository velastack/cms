/**
 * `@velastack/cms/build` — the one Svelte parser for build tooling.
 *
 * The templates repo's `pack` and `verify` steps, and this package's own Vite
 * plugin, all need the same three things: which CMS components a `.svelte`
 * file uses ({@link scanUsages}), how to write a content manifest's values
 * into those usages as `fallback` props ({@link injectFallbacks}), and which
 * scope a file's values live in ({@link fallbackResolverFor}, on top of
 * {@link buildManifest}). Keeping them here means no consumer carries a Svelte
 * parser of its own. {@link checkContent} holds a site to the manifest: every
 * usage has a fallback, and no content value outlives the usage that read it.
 */
import { basename } from 'node:path';
import { parseSvelteSource, type ComponentUsage } from './parse-svelte.js';
import {
	buildManifest,
	isPackageSource,
	resolveScopeAttr,
	ROOT_SCOPE_ID,
	type BuildManifestOptions,
	type BuildManifestResult,
	type CmsManifest,
	type CmsManifestScope,
	type CmsManifestUsage,
	type UsageSite
} from './manifest.js';

export { buildManifest, resolveScopeAttr, ROOT_SCOPE_ID };

export type Tree = Record<string, unknown>;

/** Dot-path read, the same rule as `core/path.ts` (numeric segments index arrays). */
const get = (tree: unknown, path: string): unknown => {
	let cur: unknown = tree;
	for (const seg of path.split('.')) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[seg];
	}
	return cur;
};
export type {
	BuildManifestOptions,
	BuildManifestResult,
	CmsManifest,
	CmsManifestScope,
	CmsManifestUsage,
	UsageSite
};

export type CmsUsage = {
	/** Static `name=` literal, or `null` when absent or dynamic. */
	name: string | null;
	/** Canonical exported component name (`CmsText`, `CmsHours`, …). */
	component: string;
	/** Local binding used in the template. */
	local: string;
	/** Resolved scope id from `scope=`, or `null` for the enclosing route scope. */
	scope: string | null;
	preset: string | null;
	/** `name=` was present but not a static string. */
	dynamic: boolean;
	hasValue: boolean;
	hasFallback: boolean;
	line: number;
	/** Source offsets of the component node. */
	start: number;
	end: number;
};

export type ScanOptions = {
	filename?: string;
	/**
	 * Extra local names to treat as CMS components, for wrappers a template
	 * declares itself. Package imports and `#lib/components/cms/*` (or the
	 * older `$lib/components/cms/*`) are always recognized.
	 */
	components?: string[];
};

export type ScanResult = {
	usages: CmsUsage[];
	/** Dynamic names, which no manifest can record. */
	warnings: string[];
};

/** The in-tree component directory, by subpath import (Kit 3) or the old `$lib` alias. */
const IN_TREE_CMS_DIRS = ['#lib/components/cms', '$lib/components/cms'];

const isInTreeCmsBarrel = (source: string): boolean =>
	IN_TREE_CMS_DIRS.some((dir) => source === dir || source === dir + '/index.js');

const isInTreeCmsFile = (source: string): boolean =>
	source.endsWith('.svelte') && IN_TREE_CMS_DIRS.some((dir) => source.startsWith(dir + '/'));

/**
 * Classify a single file's imports without a bundler: the package by name,
 * the in-tree `#lib/components/cms` (or `$lib/…`) barrel or files, and the
 * caller's own list. Returns local binding → canonical component name.
 */
const classifyImports = (
	imports: ReturnType<typeof parseSvelteSource>['imports'],
	extra: string[]
): Map<string, string> => {
	const out = new Map<string, string>();
	for (const imp of imports) {
		const source = imp.source;
		if (isPackageSource(source) || isInTreeCmsBarrel(source)) {
			for (const b of imp.bindings) if (b.imported !== 'default') out.set(b.local, b.imported);
			continue;
		}
		if (isInTreeCmsFile(source)) {
			for (const b of imp.bindings) {
				if (b.imported === 'default') out.set(b.local, basename(source, '.svelte'));
			}
		}
	}
	for (const name of extra) if (!out.has(name)) out.set(name, name);
	return out;
};

const toUsage = (u: ComponentUsage, component: string): CmsUsage => ({
	name: u.fieldName,
	component,
	local: u.componentName,
	scope: u.scopeAttr ? resolveScopeAttr(u.scopeAttr) : null,
	preset: u.presetAttr,
	dynamic: u.dynamicName,
	hasValue: u.hasValueAttr,
	hasFallback: u.hasFallbackAttr,
	line: u.line,
	start: u.start,
	end: u.end
});

/** Every CMS component usage in one `.svelte` source. */
export const scanUsages = (source: string, options: ScanOptions = {}): ScanResult => {
	const parsed = parseSvelteSource(source, options.filename);
	const locals = classifyImports(parsed.imports, options.components ?? []);
	const usages: CmsUsage[] = [];
	const warnings: string[] = [];
	const where = options.filename ?? '<source>';
	for (const u of parsed.componentUsages) {
		const component = locals.get(u.componentName);
		if (!component) continue;
		const usage = toUsage(u, component);
		usages.push(usage);
		if (usage.dynamic) {
			warnings.push(`${where}:${u.line} <${u.componentName}> has a dynamic name`);
		}
	}
	return { usages, warnings };
};

/** Returns the value to inject for a usage, or `undefined` to leave it alone. */
export type FallbackResolver = (usage: CmsUsage) => unknown;

export type InjectOptions = ScanOptions & {
	/** Replace an existing `fallback` / `initial` prop instead of skipping it. */
	overwrite?: boolean;
	/**
	 * The file's CMS components, local → canonical, as {@link buildManifest}
	 * resolved them (`cmsLocalsByFile`). Without it, components are recognised
	 * by import string alone, which misses imports the walk resolves, such as a
	 * project's own barrel.
	 */
	locals?: Map<string, string>;
};

export type InjectResult = {
	code: string;
	/** Names that received a fallback. */
	injected: string[];
	/** Static names the resolver had no value for. */
	missing: string[];
};

/** Components whose fallback prop is not called `fallback`. */
const FALLBACK_PROP: Record<string, string> = { CmsBoolean: 'initial' };

/**
 * Write values into a file's CMS usages as `fallback={…}` props (the JSON
 * literal of the value), leaving the source otherwise untouched. `resolve`
 * is a content tree keyed by name, or a function for callers that know
 * which scope each usage's value lives in (see {@link fallbackResolverFor}).
 *
 * Usages with a `value=` prop, a dynamic name, or (unless `overwrite`) an
 * existing fallback are skipped. The plugin calls this in memory at build
 * time in the templates repo; `pack` calls it to write the tarball's
 * components, which is why it is also exported as {@link inlineFallbacks}.
 */
export const injectFallbacks = (
	source: string,
	resolve: Tree | FallbackResolver,
	options: InjectOptions = {}
): InjectResult => {
	const parsed = parseSvelteSource(source, options.filename);
	const locals = options.locals ?? classifyImports(parsed.imports, options.components ?? []);
	const resolver: FallbackResolver =
		typeof resolve === 'function' ? resolve : (u) => (u.name ? get(resolve, u.name) : undefined);

	const edits: Array<{ at: number; text: string; replace?: [number, number] }> = [];
	const injected: string[] = [];
	const missing: string[] = [];

	for (const u of parsed.componentUsages) {
		const component = locals.get(u.componentName);
		if (!component || !u.fieldName || u.hasValueAttr || u.nameAttrEnd === null) continue;
		if (u.hasFallbackAttr && !options.overwrite) continue;
		const value = resolver(toUsage(u, component));
		if (value === undefined) {
			missing.push(u.fieldName);
			continue;
		}
		const prop = FALLBACK_PROP[component] ?? 'fallback';
		const literal = JSON.stringify(value);
		// Replace the prop where it already stands (shorthand `initial`,
		// `{initial}`, `initial={…}` or `initial="…"`), so the result never
		// carries it twice; otherwise add it after `name=`.
		const existing = u.fallbackAttrSpans[prop as 'fallback' | 'initial'];
		if (existing) edits.push({ at: existing[0], text: `${prop}={${literal}}`, replace: existing });
		else edits.push({ at: u.nameAttrEnd, text: ` ${prop}={${literal}}` });
		injected.push(u.fieldName);
	}

	// Apply from the end so earlier offsets stay valid.
	edits.sort((a, b) => b.at - a.at);
	let code = source;
	for (const e of edits) {
		if (e.replace) code = code.slice(0, e.replace[0]) + e.text + code.slice(e.replace[1]);
		else code = code.slice(0, e.at) + e.text + code.slice(e.at);
	}
	return { code, injected, missing };
};

/** Same operation as {@link injectFallbacks}, named for the `pack` step that
 * writes the result to disk. */
export const inlineFallbacks = injectFallbacks;

/**
 * A resolver for one file, given a built manifest and a content manifest
 * keyed by scope id (`layout:/`, `page:/(public)/about`, …). A usage with
 * `scope=` reads that scope; otherwise the scopes that reach the file are
 * tried leaf first, and the first one holding the value wins.
 */
export const fallbackResolverFor = (
	result: Pick<BuildManifestResult, 'scopesByFile'>,
	file: string,
	content: Record<string, Tree>
): FallbackResolver => {
	const reach = result.scopesByFile.get(file) ?? [];
	return (usage) => {
		if (!usage.name) return undefined;
		const candidates = usage.scope ? [usage.scope] : reach;
		for (const scopeId of candidates) {
			const v = get(content[scopeId], usage.name);
			if (v !== undefined) return v;
		}
		return undefined;
	};
};

/** A usage that renders nothing until an editor stores a value. */
export type MissingFallback = UsageSite;

/** A content value no usage reads. `path` is null when the whole scope has no route. */
export type StaleContent = { locale: string; scopeId: string; path: string | null };

/**
 * Check content manifests (`content/<locale>.json`, keyed by scope id)
 * against the usages the manifest recorded.
 *
 * - `missing`: usages with no `fallback`/`initial`, no fallback markup, and no
 *   value in the default locale's content. `CmsBoolean` is exempt: without
 *   `initial` it reads `false`, a value.
 * - `stale`: values nothing reads, in every locale: a scope no route has, or
 *   a path under a scope that no usage's `name` covers. A structured value is
 *   read as a whole, and a stale branch is reported once at its top. Page
 *   `metadata` (the SEO panel's, with schemas a route may extend) and `site`
 *   are not checked.
 */
export const checkContent = (
	result: Pick<BuildManifestResult, 'manifest' | 'usageSites'>,
	content: Record<string, Record<string, Tree> | null>,
	defaultLocale: string
): { missing: MissingFallback[]; stale: StaleContent[] } => {
	const fallbacks = content[defaultLocale] ?? {};
	const missing = result.usageSites.filter(
		(u) =>
			!u.fallback && u.component !== 'CmsBoolean' && get(fallbacks[u.scopeId], u.name) === undefined
	);

	const names = new Map<string, { kind: 'layout' | 'page'; names: Set<string> }>();
	for (const route of Object.values(result.manifest.routes)) {
		for (const scope of route.scopes) {
			const entry = names.get(scope.scopeId) ?? { kind: scope.kind, names: new Set<string>() };
			for (const u of scope.usages) entry.names.add(u.name);
			names.set(scope.scopeId, entry);
		}
	}

	const stale: StaleContent[] = [];
	for (const [locale, tree] of Object.entries(content)) {
		for (const [scopeId, value] of Object.entries(tree ?? {})) {
			if (scopeId === 'site') continue;
			const scope = names.get(scopeId);
			if (!scope) {
				stale.push({ locale, scopeId, path: null });
				continue;
			}
			const read = [...scope.names];
			const walk = (node: unknown, path: string) => {
				if (scope.kind === 'page' && path.split('.')[0] === 'metadata') return;
				if (read.some((n) => path === n || path.startsWith(n + '.'))) return;
				const below = read.some((n) => n.startsWith(path + '.'));
				if (!below || node === null || typeof node !== 'object') {
					stale.push({ locale, scopeId, path });
					return;
				}
				for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
			};
			for (const [k, v] of Object.entries(value ?? {})) walk(v, k);
		}
	}
	return { missing, stale };
};
