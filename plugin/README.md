# `velacms/vite` — Vite plugin

Build-time companion to [`velacms`](../README.md). Walks SvelteKit's `src/routes`
tree, scans every route file's static Svelte import graph, and exposes the
result as virtual modules that the runtime CMS components and AdminBar consume.
Also auto-injects two small bits of glue so authors don't repeat themselves at
every route.

## Install

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { velacms } from 'velacms/vite';

export default defineConfig({
  plugins: [velacms(), sveltekit()]
});
```

`velacms()` should be registered **before** `sveltekit()`. The plugin sets
`enforce: 'pre'` so its `transform` hook runs before vite-plugin-svelte
compiles the route file.

## Options

```ts
type VelacmsPluginOptions = {
  routesDir?: string;            // default: 'src/routes' (relative to vite root)
  libDir?: string;               // default: 'src/lib'
  components?: ExternalCmsComponentSpec[];
  traverse?: (string | RegExp)[];
};

type ExternalCmsComponentSpec =
  | { source: string; names: string[] }   // bare specifier with named CMS exports
  | { source: string; default: true };    // bare specifier whose default export is a CMS component
```

- `routesDir` / `libDir` — only override if your project diverges from the
  SvelteKit defaults.
- `components` — third-party CMS component packs the walker should recognize.
  Auto-discovered for everything inside `<libDir>/components/cms/` and the
  `velacms` package itself; use this for components installed from npm.
- `traverse` — bare specifiers whose `.svelte` files contain CMS usages but
  aren't themselves CMS components (wrapper packages). Strings match
  `source === pattern || source.startsWith(pattern + '/')`. Auto-populated with
  every `components[].source`.

## Virtual modules

### `virtual:vela-cms/manifest`

```ts
import { cmsManifest } from 'virtual:vela-cms/manifest';

type CmsManifest = {
  version: 1;
  routes: Record<string, { scopes: CmsManifestScope[] }>;
};

type CmsManifestScope = {
  scopeId: string;                  // 'layout:/(marketing)' or 'page:/(marketing)/rooms/[slug]'
  kind: 'layout' | 'page';
  routeId: string;                  // route the scope is rooted at
  ownedParams: string[];            // params introduced at this scope (deduped up-chain)
  fields: string[];                 // CMS field names referenced anywhere in the scope
  metadata?: string[];              // page-only — editable metadata field names
};
```

One entry per route id whose chain ends in a `+page.svelte`. Each entry's
`scopes` array goes from root layout → leaf page; layouts that contribute
nothing are still included. `loadCms` consumes this map at request time.

### `virtual:vela-cms/pages`

```ts
import { pages } from 'virtual:vela-cms/pages';
// pages: Record<string, { routeId: string; /* …user definePage(...) config */ }>
```

Aggregates every `page.cms.ts` next to a `+page.svelte` (one per route).
Each entry is the `definePage(...)` config plus the auto-injected `routeId`.
The AdminBar reads this to know what's editable per page.

## Auto-injection

### Scope install in route `.svelte` files

For every `+layout.svelte` and `+page.svelte` whose route appears in the
manifest, the plugin prepends an `installCmsScope({...})` call into the
instance script (or creates one if absent). Authors never write
`setContext(CMS_SCOPE, ...)` manually.

### `routeId` into zero-arg `generateEntries()` calls

In any `+page.ts` or `+page.server.ts` that imports `generateEntries` (from
anywhere — typically `$lib/cms.ts`), zero-argument calls
`generateEntries()` are rewritten to `generateEntries('<routeId>')`. Calls
with any explicit argument are left alone — that's the documented opt-out.

## What gets walked

For each route entrypoint (`+page.svelte` or `+layout.svelte`), the plugin
parses with `svelte/compiler` and follows static imports of `.svelte` files.
Imports get classified as CMS components by:

1. **In-tree barrel** — anything from `<libDir>/components/cms/index.{ts,js}`.
   Named imports are CMS components; default isn't.
2. **In-tree files** — `.svelte` files directly under `<libDir>/components/cms/`.
   Default imports are CMS components.
3. **`velacms` package** — any import resolving inside the velacms package
   itself (named exports, plus `.svelte` default imports).
4. **External `components` spec** — user-declared packs.

Component usages with a `name=<static>` prop are recorded as field
references; `value=<…>` opts the call out (it's a runtime override, not a
field). Dynamic `name={expr}` props are ignored.

## HMR

The plugin invalidates `virtual:vela-cms/manifest` and
`virtual:vela-cms/pages` (plus the per-`page.cms.ts` synthetic ids) when:

- a `.svelte` file already in the visited graph changes, or
- any file in `routesDir/` changes (route added/removed), or
- a `+page.ts` / `+page.server.ts` / `page.cms.ts` changes.

The walker re-runs lazily on the next `load` of the virtual module.

## Stability

Pre-1.0. The `CmsManifest` shape is part of the public surface; the
synthetic `page-cms-N` ids and the install-call code template are
internal implementation details and may change.
