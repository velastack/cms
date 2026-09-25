/**
 * `@velastack/cms/build` — the one Svelte parser for build tooling.
 *
 * The templates repo's `pack` and `verify` steps, and this package's own Vite
 * plugin, all need the same three things: which CMS components a `.svelte`
 * file uses ({@link scanUsages}), how to write a content manifest's values
 * into those usages as `fallback` props ({@link injectFallbacks}), and which
 * scope a file's values live in ({@link fallbackResolverFor}, on top of
 * {@link buildManifest}). Keeping them here means no consumer carries a Svelte
 * parser of its own.
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
	type CmsManifestUsage
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
	CmsManifestUsage
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
	 * declares itself. Package imports and `$lib/components/cms/*` are always
	 * recognized.
	 */
	components?: string[];
};

export type ScanResult = {
	usages: CmsUsage[];
	/** Dynamic names, which no manifest can record. */
	warnings: string[];
};

const IN_TREE_CMS_DIR = '$lib/components/cms';

/**
 * Classify a single file's imports without a bundler: the package by name,
 * the in-tree `$lib/components/cms` barrel or files, and the caller's own
 * list. Returns local binding → canonical component name.
 */
const classifyImports = (
	imports: ReturnType<typeof parseSvelteSource>['imports'],
	extra: string[]
): Map<string, string> => {
	const out = new Map<string, string>();
	for (const imp of imports) {
		const source = imp.source;
		if (
			isPackageSource(source) ||
			source === IN_TREE_CMS_DIR ||
			source === IN_TREE_CMS_DIR + '/index.js'
		) {
			for (const b of imp.bindings) if (b.imported !== 'default') out.set(b.local, b.imported);
			continue;
		}
		if (source.startsWith(IN_TREE_CMS_DIR + '/') && source.endsWith('.svelte')) {
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
	const locals = classifyImports(parsed.imports, options.components ?? []);
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
		if (u.hasFallbackAttr) {
			const existing = findAttr(source, u.start, u.end, prop);
			if (existing)
				edits.push({ at: existing[0], text: `${prop}={${literal}}`, replace: existing });
			else edits.push({ at: u.nameAttrEnd, text: ` ${prop}={${literal}}` });
		} else {
			edits.push({ at: u.nameAttrEnd, text: ` ${prop}={${literal}}` });
		}
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

/** Locate `prop=` inside a component node's source. Returns `[start, end]`. */
const findAttr = (
	source: string,
	start: number,
	end: number,
	prop: string
): [number, number] | null => {
	const re = new RegExp(`\\s${prop}\\s*=`, 'g');
	const slice = source.slice(start, end);
	const m = re.exec(slice);
	if (!m) return null;
	const attrStart = start + m.index + 1;
	// Find the matching end: either a quoted string or a balanced `{…}`.
	let i = start + m.index + m[0].length;
	while (i < end && /\s/.test(source[i])) i++;
	if (source[i] === '"' || source[i] === "'") {
		const q = source[i];
		i++;
		while (i < end && source[i] !== q) i++;
		return [attrStart, i + 1];
	}
	if (source[i] === '{') {
		let depth = 0;
		for (; i < end; i++) {
			const c = source[i];
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) return [attrStart, i + 1];
			} else if (c === '"' || c === "'" || c === '`') {
				const q = c;
				i++;
				while (i < end && source[i] !== q) {
					if (source[i] === '\\') i++;
					i++;
				}
			}
		}
	}
	return null;
};

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
