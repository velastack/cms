#!/usr/bin/env node
/**
 * Resolves the admin-bar's Tailwind v4 CSS and wraps it in @scope.
 *
 * The package ships .svelte source files; consumers don't have Tailwind. So
 * after svelte-package copies things into dist/, this script:
 *   1. runs the Tailwind CLI to produce vanilla CSS scanning admin-bar sources,
 *   2. asserts no `@import "tailwindcss"` remains (i.e. it actually ran),
 *   3. wraps the output in `@scope (.vela-admin-bar) { ... }`,
 *   4. overwrites dist/components/admin-bar/admin-bar.css.
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

const emitted = [...resolved.matchAll(/@layer\s+([a-z-]+)\s*[{;]/g)].map((m) => m[1]);
const unknown = emitted.filter((l) => !LAYERS.includes(l));
if (unknown.length) {
	console.error(
		`[build-admin-bar-css] unexpected cascade layer(s): ${[...new Set(unknown)].join(', ')}`
	);
	console.error('  Update LAYERS to match, or the declared order will be wrong.');
	process.exit(1);
}

const wrapped = `@layer ${LAYERS.join(', ')};\n@scope (.vela-admin-bar) {\n${resolved}\n}\n`;
writeFileSync(output, wrapped);

console.log(`[build-admin-bar-css] wrapped in @scope — ${wrapped.length} bytes written`);
