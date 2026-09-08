#!/usr/bin/env node
/**
 * Resolves the admin-bar's Tailwind v4 CSS and wraps it in @scope.
 *
 * The package ships .svelte source files; consumers don't have Tailwind. So
 * after svelte-package copies things into dist/, this script:
 *   1. runs the Tailwind CLI to produce vanilla CSS scanning admin-bar sources,
 *   2. asserts no `@import "tailwindcss"` remains (i.e. it actually ran),
 *   3. re-targets every rule that addresses the root at the scoping root,
 *   4. wraps the output in `@scope (.vela-admin-bar) { ... }`,
 *   5. overwrites dist/components/admin-bar/admin-bar.css.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const input = resolve(root, 'src/lib/components/admin-bar/admin-bar.css');
const output = resolve(root, 'dist/components/admin-bar/admin-bar.css');
const cli = resolve(root, 'node_modules/.bin/tailwindcss');

if (!existsSync(input)) {
	console.error(`[build-admin-bar-css] missing input: ${input}`);
	process.exit(1);
}
if (!existsSync(cli)) {
	console.error(`[build-admin-bar-css] missing binary: ${cli}`);
	process.exit(1);
}

console.log(`[build-admin-bar-css] resolving Tailwind → ${output}`);
execFileSync(cli, ['-i', input, '-o', output, '--minify'], {
	stdio: 'inherit',
	cwd: root
});

const resolved = readFileSync(output, 'utf8');
if (/@import\s+["']tailwindcss/.test(resolved)) {
	console.error(
		'[build-admin-bar-css] @import "tailwindcss" still present — Tailwind did not run.'
	);
	process.exit(1);
}

// Cascade layer names are global — `@scope` does not contain them. Declare the
// order explicitly and at the top level (a statement nested inside `@scope`
// would not register) so precedence is deterministic instead of falling out of
// whichever stylesheet the host parses first. This is Tailwind's own canonical
// order, so a host also running Tailwind v4 agrees rather than conflicts.
const LAYERS = ['properties', 'theme', 'base', 'components', 'utilities'];
let rootRules = 0;
let classRules = 0;

const emitted = [...resolved.matchAll(/@layer\s+([a-z-]+)\s*[{;]/g)].map((m) => m[1]);
const unknown = emitted.filter((l) => !LAYERS.includes(l));
if (unknown.length) {
	console.error(
		`[build-admin-bar-css] unexpected cascade layer(s): ${[...new Set(unknown)].join(', ')}`
	);
	console.error('  Update LAYERS to match, or the declared order will be wrong.');
	process.exit(1);
}

// Inside `@scope (.vela-admin-bar) { ... }` a selector that does not mention
// `:scope` (or `&`) is implicitly `:scope <descendant>`: it matches the
// root's descendants but never the root itself (CSS Cascade 6, as shipped in
// Chrome). Two kinds of rule therefore silently match nothing once wrapped:
//
//   - Tailwind's theme layer, which declares `--vela-spacing`, the radius
//     scale, fonts and so on on `:root, :host`, and
//   - the `.vela-admin-bar { --vela-* / --cms-* }` token blocks and the
//     `.vela-admin-bar *` resets in admin-bar.css.
//
// Both must land on the scoping root so their custom properties inherit into
// the bar, so rewrite them to `:scope`. The source file keeps the class
// selectors because the package's own dev app imports it unwrapped, where
// `:scope` would mean `:root` and leak the reset onto the host page.
const retargeted = resolved
	.replace(/:root\s*,\s*:host/g, () => {
		rootRules++;
		return ':scope';
	})
	.replace(/\.vela-admin-bar/g, () => {
		classRules++;
		return ':scope';
	});
if (!rootRules || !classRules) {
	console.error(
		`[build-admin-bar-css] expected root selectors to retarget, found :root,:host ×${rootRules} and .vela-admin-bar ×${classRules}.`
	);
	console.error('  The Tailwind output or admin-bar.css changed shape; update the rewrite.');
	process.exit(1);
}

const wrapped = `@layer ${LAYERS.join(', ')};\n@scope (.vela-admin-bar) {\n${retargeted}\n}\n`;
writeFileSync(output, wrapped);

console.log(
	`[build-admin-bar-css] retargeted ${rootRules + classRules} root selector(s) to :scope, wrapped in @scope — ${wrapped.length} bytes written`
);
