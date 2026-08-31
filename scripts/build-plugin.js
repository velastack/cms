#!/usr/bin/env node
/**
 * Compiles plugin/src -> plugin/dist.
 *
 * The package used to point its `./vite` and `./adapter` exports straight at
 * the TypeScript sources. Vite externalises bare imports in a consumer's
 * config, so Node ends up loading them directly — and Node refuses to strip
 * types for files under node_modules. Shipping compiled JS is what makes the
 * plugin loadable at all.
 *
 * `fallback-shim.js` is deliberately excluded from the tsc build and copied
 * verbatim. It is never imported: the adapter reads it as text and injects it
 * into the static fallback HTML as a classic <script>. tsc would append
 * `export {}` to it, which is a syntax error in that context.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const out = resolve(root, 'plugin/dist');
const shim = 'plugin/src/fallback-shim.js';

if (!existsSync(resolve(root, shim))) {
	console.error(`[build-plugin] missing input: ${shim}`);
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });

execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', 'plugin/tsconfig.build.json'], {
	stdio: 'inherit',
	cwd: root
});

copyFileSync(resolve(root, shim), resolve(out, 'fallback-shim.js'));

console.log('[build-plugin] plugin/src -> plugin/dist (fallback-shim.js copied verbatim)');
