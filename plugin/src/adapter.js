import staticAdapter from '@sveltejs/adapter-static';
import * as devalue from 'devalue';
import fs from 'node:fs';
import path from 'node:path';
import { getPageCmsModules } from './build-state.js';

const ROUTE_GROUP_RE = /^\([^)]+\)$/;

/**
 * @typedef {Parameters<typeof staticAdapter>[0]} StaticAdapterOptions
 */

/**
 * Strip SvelteKit route groups (e.g. `(marketing)`) from a route id and return
 * the remaining segments.
 *
 * @param {string} routeId
 * @returns {string[]}
 */
const stripRouteGroups = (routeId) =>
	routeId.split('/').filter((s) => s !== '' && !ROUTE_GROUP_RE.test(s));

/**
 * Decide where a `__fallback.json` should be emitted for `routeId`. Returns
 * the URL directory (e.g. `/rooms` for `/(marketing)/rooms/[slug]`), or `null`
 * if this route doesn't get a fallback.
 *
 * Only routes whose trailing segment is parameterized AND whose earlier
 * segments are all static get a fallback — otherwise the parent directory
 * doesn't exist as a real path in the build output.
 *
 * @param {string} routeId
 * @returns {string | null}
 */
const fallbackUrlDirFor = (routeId) => {
	const segments = stripRouteGroups(routeId);
	if (segments.length === 0) return null;
	const last = segments[segments.length - 1];
	if (!last.includes('[')) return null;
	const earlier = segments.slice(0, -1);
	if (earlier.some((s) => s.includes('['))) return null;
	return earlier.length === 0 ? '/' : '/' + earlier.join('/');
};

/**
 * @param {string[]} paths
 * @param {RegExp} pattern
 */
const findSamplePath = (paths, pattern) => {
	for (const p of paths) if (pattern.test(p)) return p;
	return null;
};

/**
 * Replace concrete params/docs/metadata in the deserialized payload with
 * fallback placeholders, in place. References inside the data graph (e.g.
 * `cms.page.params` and `cms.scopes['page:...'].params` pointing at the same
 * object) are preserved by `devalue.unflatten`, so a single mutation updates
 * every alias.
 *
 * @param {any} obj
 */
const transformPayload = (obj) => {
	if (!obj || typeof obj !== 'object') return;
	const cms = obj.cms;
	if (!cms || typeof cms !== 'object') return;

	const pageScopeId = cms.page && cms.page.scopeId;
	if (pageScopeId && cms.docs && Object.prototype.hasOwnProperty.call(cms.docs, pageScopeId)) {
		cms.docs[pageScopeId] = {};
	}

	cms.metadata = {};

	if (cms.scopes && typeof cms.scopes === 'object') {
		for (const scopeId of Object.keys(cms.scopes)) {
			const scope = cms.scopes[scopeId];
			if (scope && scope.params && typeof scope.params === 'object') {
				for (const name of Object.keys(scope.params)) {
					scope.params[name] = `%${name}%`;
				}
			}
		}
	}

	if (cms.page && cms.page.params && typeof cms.page.params === 'object') {
		for (const name of Object.keys(cms.page.params)) {
			cms.page.params[name] = `%${name}%`;
		}
	}
};

/**
 * @typedef {{ kind: 'static'; value: string }
 *   | { kind: 'dynamic'; name: string }
 *   | { kind: 'rest'; name: string }
 *   | { kind: 'optional'; name: string }
 *   | { kind: 'unsupported' }} ParsedSegment
 */

/**
 * Parse a SvelteKit route id into typed segments. Route groups
 * (`(marketing)`) are stripped — they don't appear in URLs. Matchers
 * (`[slug=type]`) and mixed brackets (`prefix-[id]`) are flagged as
 * `unsupported`; the caller skips routes containing them.
 *
 * Exported for unit testing; not part of the package's public API.
 *
 * @param {string} routeId
 * @returns {ParsedSegment[]}
 */
export const parseRouteSegments = (routeId) => {
	const parts = routeId.split('/').filter((p) => p !== '' && !ROUTE_GROUP_RE.test(p));
	/** @type {ParsedSegment[]} */
	const out = [];
	for (const p of parts) {
		const opt = /^\[\[(\w+)\]\]$/.exec(p);
		if (opt) {
			out.push({ kind: 'optional', name: opt[1] });
			continue;
		}
		const rest = /^\[\.\.\.(\w+)\]$/.exec(p);
		if (rest) {
			out.push({ kind: 'rest', name: rest[1] });
			continue;
		}
		const dyn = /^\[(\w+)\]$/.exec(p);
		if (dyn) {
			out.push({ kind: 'dynamic', name: dyn[1] });
			continue;
		}
		if (p.includes('[')) {
			out.push({ kind: 'unsupported' });
			continue;
		}
		out.push({ kind: 'static', value: p });
	}
	return out;
};

/**
 * Build a URL → params extractor for a given parsed-segment list. Mirrors
 * SvelteKit's own routing semantics: static segments must match, dynamic
 * segments bind one URL part, `[[opt]]` may consume zero or one part,
 * `[...rest]` consumes the remaining parts as a `/`-joined string.
 *
 * Returns `null` if the segments include any `unsupported` marker — the
 * caller should skip those routes (and emit a build-log warning).
 *
 * Exported for unit testing; not part of the package's public API.
 *
 * @param {ParsedSegment[]} segments
 * @returns {((url: string) => Record<string, string> | null) | null}
 */
export const buildParamExtractor = (segments) => {
	if (segments.some((s) => s.kind === 'unsupported')) return null;
	return (url) => {
		const parts = url.split('/').filter((p) => p !== '');
		/** @type {Record<string, string>} */
		const params = {};
		let pi = 0;
		for (const seg of segments) {
			if (seg.kind === 'static') {
				if (parts[pi] !== seg.value) return null;
				pi++;
			} else if (seg.kind === 'rest') {
				params[seg.name] = parts.slice(pi).join('/');
				pi = parts.length;
			} else if (seg.kind === 'optional') {
				if (pi < parts.length) {
					params[seg.name] = parts[pi];
					pi++;
				} else {
					params[seg.name] = '';
				}
			} else {
				if (pi >= parts.length) return null;
				params[seg.name] = parts[pi];
				pi++;
			}
		}
		if (pi !== parts.length) return null;
		return params;
	};
};

/**
 * Read a SvelteKit `__data.json`, transform each `data` node via
 * `devalue.unflatten` → mutate → `devalue.stringify`, and re-emit the wrapping
 * `{type, nodes}` envelope.
 *
 * @param {string} jsonText
 * @returns {string}
 */
const transformDataJson = (jsonText) => {
	/** @type {{ type: string; nodes: Array<null | { type: string; data: any[]; uses?: any; slash?: any }> }} */
	const parsed = JSON.parse(jsonText);

	const nodes = parsed.nodes.map((node) => {
		if (!node || node.type !== 'data' || !Array.isArray(node.data)) return node;
		const obj = devalue.unflatten(node.data);
		transformPayload(obj);
		const newData = JSON.parse(devalue.stringify(obj));
		return { ...node, data: newData };
	});

	return JSON.stringify({ ...parsed, nodes }) + '\n';
};

/**
 * Wraps `@sveltejs/adapter-static`. After the inner adapter writes prerendered
 * pages, scans `builder.routes` for parameterized routes and emits a
 * `__fallback.json` next to each parent URL directory. The fallback is built
 * from a real prerendered `__data.json` for that route, with `cms.metadata`
 * and `cms.docs[pageScope]` cleared and every `params[name]` replaced by
 * `%name%`. The runtime can fetch the fallback when navigating to a CMS page
 * that wasn't prerendered, then substitute the actual params client-side.
 *
 * @param {StaticAdapterOptions} [options]
 */
export default function adapter(options) {
	const inner = staticAdapter(options);

	return {
		name: '@velastack/cms-static',

		/** @param {import('@sveltejs/kit').Builder} builder */
		async adapt(builder) {
			await inner.adapt(builder);

			const pages = (options && /** @type {any} */ (options).pages) || 'build';
			const buildDir = path.resolve(pages);

			// `prerendered.paths` mixes html and data entries, so use the
			// `pages` map (html only) for sampling.
			const htmlPaths = [...builder.prerendered.pages.keys()];

			let written = 0;
			for (const route of builder.routes) {
				const fallbackDir = fallbackUrlDirFor(route.id);
				if (fallbackDir === null) continue;

				const sample = findSamplePath(htmlPaths, route.pattern);
				if (!sample) continue;

				const sampleDataFile = path.join(buildDir, sample, '__data.json');
				if (!fs.existsSync(sampleDataFile)) continue;

				const target = path.join(buildDir, fallbackDir, '__fallback.json');
				const json = transformDataJson(fs.readFileSync(sampleDataFile, 'utf-8'));

				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, json);
				written++;

				builder.log.minor(
					`@velastack/cms-static: wrote ${path.relative(buildDir, target)} (from ${sample})`
				);
			}

			if (written > 0) {
				builder.log.minor(`@velastack/cms-static: wrote ${written} fallback file(s)`);
			}

			// Step 2: write `__velastack_manifest` into the SPA fallback. The
			// admin bar uses this global to enumerate creatable-route entries
			// when the page it lands on wasn't prerendered (newly created
			// pages, navigation to routes that didn't exist at build time).
			// Prerendered pages embed their own data via `__data.json`, so
			// they don't need the global.
			const fallbackName = options && /** @type {any} */ (options).fallback;
			if (!fallbackName) return;

			const fallbackPath = path.join(buildDir, fallbackName);
			if (!fs.existsSync(fallbackPath)) {
				builder.log.warn(
					`@velastack/cms-static: configured fallback "${fallbackName}" not found at ${fallbackPath}; skipping manifest injection`
				);
				return;
			}

			const creatableRouteIds = new Set(
				getPageCmsModules()
					.filter((m) => m.creatable)
					.map((m) => m.routeId)
			);
			if (creatableRouteIds.size === 0) return;

			/** @type {{ creatable: Record<string, { entries: Record<string, string>[] }> }} */
			const manifest = { creatable: {} };

			for (const route of builder.routes) {
				if (!creatableRouteIds.has(route.id)) continue;
				const segments = parseRouteSegments(route.id);
				const extract = buildParamExtractor(segments);
				if (!extract) {
					builder.log.warn(
						`@velastack/cms-static: route ${route.id} uses an unsupported segment shape (matchers or mixed brackets); skipping in manifest`
					);
					continue;
				}
				/** @type {Record<string, string>[]} */
				const entries = [];
				for (const urlPath of htmlPaths) {
					const params = extract(urlPath);
					if (params) entries.push(params);
				}
				if (entries.length === 0) continue;
				entries.sort((a, b) => {
					const sa = JSON.stringify(a);
					const sb = JSON.stringify(b);
					return sa < sb ? -1 : sa > sb ? 1 : 0;
				});
				manifest.creatable[route.id] = { entries };
			}

			if (Object.keys(manifest.creatable).length === 0) return;

			const fallbackHtml = fs.readFileSync(fallbackPath, 'utf-8');
			if (fallbackHtml.includes('__velastack_manifest')) return;

			const headIdx = fallbackHtml.indexOf('</head>');
			if (headIdx === -1) {
				builder.log.warn(
					`@velastack/cms-static: fallback "${fallbackName}" has no </head>; skipping manifest injection`
				);
				return;
			}

			const json = JSON.stringify(manifest).replace(/</g, '\\u003c');
			const tag = `<script>var __velastack_manifest = ${json};</script>`;
			const next = fallbackHtml.slice(0, headIdx) + tag + fallbackHtml.slice(headIdx);
			fs.writeFileSync(fallbackPath, next);

			const routeCount = Object.keys(manifest.creatable).length;
			const entryCount = Object.values(manifest.creatable).reduce(
				(n, v) => n + v.entries.length,
				0
			);
			builder.log.minor(
				`@velastack/cms-static: injected __velastack_manifest into ${fallbackName} (${routeCount} route(s), ${entryCount} entry(ies))`
			);
		}
	};
}
