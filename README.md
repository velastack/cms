# VelaStack CMS

A scope-aware CMS for SvelteKit, for SSG and fullstack websites.

```svelte
<!-- src/routes/(marketing)/about/+page.svelte -->
<script>
	import { CmsText, CmsRichText } from '@velastack/cms';
</script>

<h1>
	<CmsText name="hero.title" fallback="About us" />
</h1>

<CmsRichText name="body" />
```

That's the whole authoring API. No field paths, no manual wiring. The build-time Vite plugin discovers every `<CmsText/>` (and friends) reachable from each route, computes which route scope they belong to, and emits a manifest. At request time, `loadCms(event, …)` resolves the right documents for the current route. At edit time, the admin bar swaps display components for inline editors — without shipping a single byte of editing code to public visitors.

## Why scope-aware?

A reusable component like `Header.svelte` may be mounted from `(marketing)/+layout.svelte` and `(app)/+layout.svelte`. Its `<CmsText name="header.title" />` is **the same field name** in both places, but those should be **different stored values** — one for the marketing site, one for the app shell.

CMS identity therefore can't be `(component file + field name)`. It has to be `(usage scope + field name)`. The plugin walks each `+layout.svelte` / `+page.svelte`'s static import graph, attributes every CMS field reference to the route entrypoint that reached it, and emits:

```ts
{
  '/(marketing)/about': {
    scopes: [
      { scopeId: 'layout:/',                 fields: ['footer.links'] },
      { scopeId: 'layout:/(marketing)',      fields: ['header.title', 'announcement.text'] },
      { scopeId: 'page:/(marketing)/about',  fields: ['hero.title', 'body'], metadata: ['title', 'description', 'canonical', 'robots'] }
    ]
  },
  …
}
```

## Install

```sh
npm install @velastack/cms
```

## Quick start

### 1. Register the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { cms } from '@velastack/cms/vite';

export default defineConfig({
	plugins: [cms(), sveltekit()]
});
```

The plugin reads `src/routes/` and `src/lib/` by default. Override with `cms({ routesDir, libDir })` if your project is laid out differently.

### 2. Create the CMS in `$lib/cms.ts`

```ts
// src/lib/cms.ts
import { createCms, mockAdapter } from '@velastack/cms/server';

export const { load: loadCms, generateEntries } = createCms({
	adapter: mockAdapter(),
	locales: ['en'] // or ['en', 'es', 'fr'] — first entry is the default locale
});
```

Swap `mockAdapter` for your real adapter once you have a backend (see [Adapters](#adapters)).
The `locales` array names every BCP-47 locale your site supports; the first entry is the
**default locale** used for read-time fallback when a value is missing in the requested
locale (see [Locales](#locales)).

### 3. Wire `loadCms` into the root `+layout.server.ts`

Optionally include `svelte-meta-tags` for easy page metadata handling, but it isn't a requirement.

```ts
// src/routes/+layout.server.ts
import { error, redirect, type ServerLoad } from '@sveltejs/kit';
import { defineBaseMetaTags } from 'svelte-meta-tags';
import { loadCms } from '$lib/cms.js';

export const load: ServerLoad = async (event) => {
	const { baseMetaTags } = defineBaseMetaTags({
		title: 'My site',
		titleTemplate: '%s · My site'
	});

	// Pick the locale however you like — pathname segment (`/es/about`),
	// `Accept-Language`, a session cookie, etc. Pass whatever string you
	// land on; the loader doesn't care how it was derived.
	const locale = event.url.searchParams.get('locale') ?? 'en';

	const { cms, notFound, gone, redirectTo } = await loadCms(event, { locale });
	if (redirectTo) redirect(308, redirectTo);
	if (gone) error(410, 'Gone');
	if (notFound) error(404, 'Not found');

	return {
		baseMetaTags,
		cms
	};
};
```

`loadCms` returns four mutually-exclusive page-kind resolutions, in priority order:

| Field        | Meaning                                                                              | Caller does          |
| ------------ | ------------------------------------------------------------------------------------ | -------------------- |
| `redirectTo` | Page was replaced with a permanent redirect to this URL.                             | `redirect(308, …)`   |
| `gone`       | Page was deliberately, permanently removed.                                          | `error(410, …)`      |
| `notFound`   | Page-kind scope had owned params and the adapter returned no doc and no tombstone.   | `error(404, …)`      |
| (none set)   | Render normally with `data.cms`.                                                     | return `{ cms, … }`  |

Layout scopes never tombstone — only page-kind scopes can resolve to `gone` / `redirectTo`.

### 4. Render `<AdminBar/>` in the root layout

Along with optional `<MetaTags />` handling.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { MetaTags, deepMerge } from 'svelte-meta-tags';
	import { AdminBar, cms } from '@velastack/cms';

	let { data, children } = $props();
	let metaTags = $derived(deepMerge(data.baseMetaTags, cms.metadata));
</script>

<AdminBar />
<MetaTags {...metaTags} />

{@render children()}
```

`<AdminBar/>` is a tiny sync wrapper. Its UI and every editable component are dynamically imported, so public visitors never download editing code.

### 4. Author your routes

```svelte
<!-- src/routes/(marketing)/about/+page.svelte -->
<script lang="ts">
	import { CmsText, CmsRichText } from '@velastack/cms';
</script>

<h1>
	<CmsText name="hero.title" fallback="About us" />
</h1>

<CmsRichText name="body" />
```

That's it — the plugin handles scope and the loader handles data fetching.

## CMS components

All four included CMS components share the same prop shape:

| Prop       | Type               | Notes                                                                    |
| ---------- | ------------------ | ------------------------------------------------------------------------ |
| `name`     | `string`           | Field path inside this scope. Must be a static string at v1.             |
| `fallback` | varies             | Rendered when no value is stored. `string` for text, HTML for rich text. |
| `value`    | `unknown` (opt-in) | Per-item override used inside `<CmsRepeater/>`; bypasses scope lookup.   |

### `<CmsText />`

```svelte
<CmsText name="hero.title" fallback="About us" />
```

Plain text. In edit mode, swaps for an inline `<input>` bound to the draft store.

### `<CmsRichText />`

```svelte
<CmsRichText name="body" fallback="<p>Coming soon.</p>" />
```

Rendered with `{@html}`. Edit mode swaps for a `<textarea>`.

### `<CmsImage />`

```svelte
<CmsImage name="hero.image" alt="Hero" />
```

Renders an `<img>`. Edit mode shows the current image plus a URL input.

### `<CmsRepeater />`

```svelte
<CmsRepeater name="gallery.items">
	{#snippet children(item)}
		<figure>
			<CmsImage name="src" value={item.src} alt={item.caption} />
			<figcaption>
				<CmsText name="caption" value={item.caption} />
			</figcaption>
		</figure>
	{/snippet}
</CmsRepeater>
```

Iterates an array stored at `name`. Inside the snippet, pass per-item values via `value=` to bypass scope lookup. Edit mode renders the same snippet for each item plus add/remove controls and per-key inputs.

### `<CmsEntries />`

```svelte
<script lang="ts">
	import { CmsEntries } from '@velastack/cms';
</script>

<CmsEntries routeId="/(marketing)/rooms/[slug]">
	{#snippet children(entry)}
		<li>
			<a href={resolve('/(marketing)/rooms/[slug]', entry.params)}>
				{entry.metadata.title}
			</a>
		</li>
	{/snippet}
</CmsEntries>
```

Iterates over a set of pages by route ID. Useful for index pages.

## Custom CMS components VelaStack

CMS discovers your custom or third-party CMS components by convention. ### Auto-discovery (zero
config) A component is treated as a CMS component if **any** of the following hold: 1. **It lives in
your app's `src/lib/components/cms/`.** Drop a new `.svelte` file there and it's registered
automatically: ```svelte

<a href={typeof value === 'string' ? value : undefined}>
<CmsText name={`${name}.label`} {fallback} />
</a>

````

Use it from any route: `<CmsLink name="hero.cta" />`. The plugin picks up `hero.cta` as a field on the page's scope; no plugin config edit required.

2. **It's a named export from your local `src/lib/components/cms/index.{ts,js}` barrel.** Re-export your component there if you prefer a single import path..

3. **It's imported from the `@velastack/cms` package itself.** The four built-ins (`CmsText`, `CmsRichText`, `CmsImage`, `CmsRepeater`) work this way: any import resolving inside the installed `@velastack/cms` package is auto-classified.

### Third-party packs (opt-in)

For CMS components published in npm packages outside @velastack/cms, declare them with the plugin's `components` option:

```ts
// vite.config.ts
import { cms } from '@velastack/cms/vite';

cms({
	components: [
		// Named exports — `import { Hero, Quote } from 'my-cms-pack'`
		{ source: 'my-cms-pack', names: ['Hero', 'Quote'] },
		// Single-file default export — `import Accordion from 'my-cms-pack/accordion.svelte'`
		{ source: 'my-cms-pack/accordion.svelte', default: true }
	]
});
```

Listed sources are auto-registered for traversal; the plugin walks `.svelte` files inside those packages to discover any further CMS usages they contain.

If you want the walker to descend into a package whose `.svelte` files **contain** CMS usages but aren't themselves CMS components (a wrapper / design-system scenario), add it to `traverse`:

```ts
cms({
	traverse: ['my-design-system', /^@my-org\//]
});
```

String patterns match `source === pattern || source.startsWith(pattern + '/')`. RegExp is the escape hatch — use it sparingly; matching too broadly will pull arbitrary `node_modules` `.svelte` files into the walk.

### Component contract

A CMS component should:

- Accept `{ name: string; fallback?: string; value?: unknown }` props (and any extras you need).
- Call `getCmsScope()` from `cms` to find its scope.
- Read drafts via `cmsStore.hasDraft(scopeKey, name)` / `cmsStore.getValue(scopeKey, name)` when `cmsStore.isEditing` is true; fall back to `page.data.cms.docs[scopeKey][name]` otherwise.
- Skip scope lookup when `value !== undefined` — that prop is the per-item override used inside `<CmsRepeater/>`.
- Optionally provide an editable sibling that's dynamically `import()`'d when `cmsStore.isEditing` flips on, so editing code doesn't ship to public visitors.

The four built-ins are reference implementations; copy `src/lib/components/cms/cms-text.svelte` (or one of the other built-ins with a paired `*-editable.svelte` sibling) as a starting point.

## Architecture

### Scopes

A scope is `{ kind, routeId, ownedParams }`. There are two kinds:

- **`layout:/(marketing)`** — content the marketing layout uses. Shared across every page rendered through `(marketing)`.
- **`page:/(marketing)/rooms/[slug]`** — page-specific content. With `ownedParams: ['slug']`, the runtime composes scope keys per slug: `page:/(marketing)/rooms/[slug]?slug=suite-1`.

A request through `/(marketing)/rooms/suite-1` produces three scope queries (root layout, marketing layout, page) and the adapter resolves all three. The runtime returns one merged `CmsPayload`:

```ts
{
  locale: 'en',                  // resolved locale for this request
  locales: ['en', 'es', 'fr'],   // supported set, default = first entry
  docs: {
    'layout:/(marketing)': { 'header.title': '…' },
    'page:/(marketing)/rooms/[slug]?slug=suite-1': { 'hero.title': '…' }
  },
  scopes: { /* one entry per scopeKey, with kind/routeId/params/fields/metadata */ },
  metadata: { title: '…', description: '…' } // page-scoped only
}
```

Components read from this via `getContext(CMS_SCOPE)` + `page.data.cms`.

### Auto-injected scope context

The Vite plugin transforms every `+layout.svelte` and `+page.svelte` by inserting:

```ts
import { installCmsScope } from '@velastack/cms';

installCmsScope({
	scopeId: 'page:/(marketing)/rooms/[slug]',
	kind: 'page',
	routeId: '/(marketing)/rooms/[slug]',
	ownedParams: ['slug']
});
```

`installCmsScope` synchronously seeds the scope from `page.params` (so SSR is correct) and keeps `scopeKey` in sync via `$effect` (so client-side navigations between sibling param values update reactively).

### Edit mode

`cmsStore` is a runes-backed singleton:

- `isEditing: boolean`
- `drafts: Record<scopeKey, Record<fieldName, value>>`
- `metadataDrafts: Record<scopeKey, Record<metaKey, value>>`
- `setValue` / `getValue` / `hasDraft`
- `setMetadataValue` / `getMetadataValue` / `hasMetadataDraft`
- `save()` — currently logs to the console (replace with a write-back call once you wire your adapter)
- `clearDrafts()`

Display components prefer drafts over published values when `isEditing` is true. Editable variants (`*-editable.svelte`) and the SEO panel are dynamic-import-only chunks; nothing edit-related ships in the public bundle.

### Page metadata

Page scopes carry an editable metadata field list (default: `title`, `description`, `canonical`, `robots`). Resolution order, per design:

```
editable page metadata (cms.metadata)
  → static route/template defaults (+page.ts pageMetaTags)
  → static site defaults (defineBaseMetaTags)
```

Hand `cms.metadata` directly to `definePageMetaTags(...)` from `svelte-meta-tags` and you're done.

## Adapters

```ts
export interface CmsAdapter {
	readonly endpoint?: string;

	fetchDocs(
		queries: CmsScopeQuery[],
		context: CmsAdapterContext
	): Promise<Record<string, CmsAdapterResolution>> | Record<string, CmsAdapterResolution>;

	fetchEntries(
		routeId: string,
		context: CmsAdapterContext
	): Promise<CmsEntry[]> | CmsEntry[];
}

type CmsAdapterContext = {
	fetch: typeof fetch;        // SvelteKit's request-scoped fetch
	previewKey?: string | null; // ?preview= — overlay an open release's pending edits
	versionKey?: string | null; // ?version= — load a past published release snapshot
	locale: string;             // BCP-47 bound at loadCms({ locale }) time
	locales: string[];          // supported set; first entry is the default locale
};

type CmsScopeQuery = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	params: Record<string, string>; // owned params for this scope only
	fields: string[];
	locale: string;                 // request locale, repeated per query for adapter convenience
};

type CmsAdapterResolution = CmsAdapterDoc | CmsAdapterTombstone;
type CmsAdapterDoc = { contents: Record<string, unknown> };
type CmsAdapterTombstone =
	| { kind: 'gone' }
	| { kind: 'redirect'; to: string };
```

Each `CmsScopeQuery` carries the composed `scopeId`, the `kind` (`'layout' | 'page'`), the route id, the resolved owned params, the field list, and the locale. Map those to backend reads however you want. The `context.fetch` argument is the SvelteKit request-scoped fetch for HTTP-backed adapters.

Page-kind docs own a `metadata` branch on the doc tree. `loadCms` aliases that branch onto `cms.metadata` (for `definePageMetaTags(...)`) without removing it from the doc — components addressing `metadata.title` etc. read straight through.

A page-kind scope can also resolve to a **tombstone** (`{ kind: 'gone' }` or `{ kind: 'redirect', to }`) instead of a doc. The loader short-circuits the page render and surfaces `gone` / `redirectTo` on the `LoadCmsResult` so the caller can return 410 / 308. Layout scopes never tombstone.

`fetchEntries` enumerates publishable entries at one route id (used by `generateEntries` for prerender). Tombstoned entries are returned with `redirectTo` / `gone` flags so prerender visits the URL and SvelteKit emits the redirect file; the loader filters them out of `cms.entries` before display.

### `mockAdapter` (built-in)

Useful for tests, demos, and pre-backend development. Storage is keyed by `[locale][routeId]`:

```ts
import { mockAdapter } from '@velastack/cms/server';

const adapter = mockAdapter({
	layoutDocs: {
		en: { '/(marketing)': { header: { title: 'Climb Angola' } } },
		es: { '/(marketing)': { header: { title: 'Escalar Angola' } } }
	},
	pageDocs: {
		en: {
			'/(marketing)/about': [
				{
					params: {},
					published: {
						hero: { title: 'About us' },
						metadata: { title: 'About us' }
					}
				}
			]
		}
	}
});
```

A page can be **tombstoned at publish time** by setting `tombstone` on its `PageEntry`:

```ts
mockAdapter({
	pageDocs: {
		en: {
			'/(marketing)/rooms/[slug]': [
				// Hard 410 — this URL is permanently gone.
				{ params: { slug: 'old-suite' }, published: {}, tombstone: { kind: 'gone' } },
				// Permanent redirect — visitors land on the new URL.
				{
					params: { slug: 'legacy' },
					published: {},
					tombstone: { kind: 'redirect', to: '/rooms/suite-1' }
				}
			]
		}
	}
});
```

Pass `resolvePreview` to enable release-preview overlay; release items can also stage tombstones in flight via `outcome` on a `page-delete` item:

```ts
{
  kind: 'page-delete',
  routeId: '/(marketing)/rooms/[slug]',
  params: { slug: 'legacy' },
  locale: 'en',
  outcome: { kind: 'redirect', to: '/rooms/suite-1' } // omit for hard delete (404 after publish)
}
```

### Writing your own adapter

A skeleton sketch:

```ts
import type { CmsAdapter, CmsAdapterResolution } from '@velastack/cms/server';

export const myAdapter = (config: { project: string; client: MyClient }): CmsAdapter => ({
	async fetchDocs(queries, { fetch, locale, previewKey }) {
		const rows = await config.client.findMany({
			project: config.project,
			keys: queries.map((q) => ({
				scopeId: q.scopeId,
				routeId: q.routeId,
				params: q.params,
				locale: q.locale
			})),
			previewKey,
			fetch
		});
		const out: Record<string, CmsAdapterResolution> = {};
		for (const r of rows) {
			out[r.scopeId] = r.tombstone ?? { contents: r.contents };
		}
		return out;
	},
	async fetchEntries(routeId, { fetch, locale }) {
		const rows = await config.client.listEntries({
			project: config.project,
			routeId,
			locale,
			fetch
		});
		return rows.map((r) => ({
			params: r.params,
			metadata: r.metadata ?? {},
			...(r.redirectTo ? { redirectTo: r.redirectTo } : {}),
			...(r.gone ? { gone: true as const } : {})
		}));
	}
});
```

The adapter doesn't need to implement default-locale fallback — `resolveCmsPayload` issues a parallel default-locale `fetchDocs` when needed and merges trees on the loader side. Just return what's stored for the requested locale.

## Locales

Locale support is first-class and lives at the release / version dimension: every release contains items across every locale you've touched, so publishing ships all locales atomically. Items are tagged `(scope, locale, tree)`; switching the editor's preview locale is a free UI op against the same release.

**Configuration:** pass the supported set to `createCms({ locales })`. The first entry is the **default locale**.

**Per-request:** the consumer decides how to derive a locale from the request (pathname, `Accept-Language`, cookie, query param, …) and passes the resulting string to `loadCms(event, { locale })`. The library doesn't read URLs itself.

**Default-locale fallback:** when `locale !== locales[0]`, the loader fetches docs in both locales and merges (`mergeTree(default, requested)`), so a missing `hero.title` in `es` falls through to the EN value. Arrays replace wholesale — explicit ES content always overrides EN, but absent ES keys inherit. Page-kind tombstones in either locale apply (requested wins on conflict).

**Editor preview locale:** the admin bar uses `?locale=` to override whichever locale the consumer's logic would have picked, so editors can preview any locale at any URL without changing pathname routing. The bar's Locales panel shows per-locale edit counts (`workingCopyCountsByLocale`) plus translation gaps (default-locale items not yet edited in each other locale).

**On the payload:**

```ts
cms.locale  // 'es'
cms.locales // ['en', 'es', 'fr']
```

## Redirects & tombstones

Pages can be deleted with three different outcomes:

| Outcome              | HTTP | When to use                                                  |
| -------------------- | ---- | ------------------------------------------------------------ |
| `notFound` (no doc)  | 404  | Default — the URL just isn't there.                          |
| `gone`               | 410  | URL was deliberately retired; tell crawlers to forget it.    |
| `redirectTo`         | 308  | URL moved permanently; preserve link equity to the new path. |

Tombstones live on the adapter's `PageEntry` (`tombstone: CmsAdapterTombstone`) for already-published deletions, and on a release's `page-delete` item (`outcome?: CmsAdapterTombstone`) for staged deletions in the editor's working copy. The loader returns whichever applies on `LoadCmsResult.{ gone, redirectTo }`; your `+layout.server.ts` branches on those flags before rendering.

For prerender, `fetchEntries` returns tombstoned entries with `redirectTo` / `gone` flags so SvelteKit visits the URL and emits the redirect file — but `cms.entries[routeId]` strips them, so `<CmsEntries>` lists never display deleted pages.

## Plugin options

```ts
cms({
	routesDir: 'src/routes', // path to SvelteKit routes (default)
	libDir: 'src/lib', // path to project lib (default)
	components: [
		// third-party CMS packs — see "Custom CMS components"
		{ source: 'my-cms-pack', names: ['Hero', 'Quote'] }
	],
	traverse: [
		// bare specifiers whose .svelte files should be walked
		'my-design-system'
	]
});
```

The plugin also exposes `virtual:vela-cms/manifest` (typed via the package's ambient declaration). You almost never need to import it directly — `loadCms` does that internally — but it's there if you want to introspect the manifest at build time.

## Constraints (v1)

Static analysis is conservative on purpose:

- `name=` props must be string literals or `name={'literal'}`. Computed names are not extracted.
- Only static `import` of `.svelte` files is followed when walking the component graph. Bare specifiers (npm packages) are skipped unless they're the @velastack/cms package itself, are listed under `components`, or match a `traverse` pattern.
- `<svelte:component this={…} />` and dynamic component selection are not traced.
- Layout reset segments (`+page@layout.svelte`) are not yet supported.

Repeater item internals can be edited via the per-key inputs the editable variant emits; nested `<CmsText name="…" value={item.x} />` overrides stay non-editable by design.

## Project layout

```
plugin/src/      Vite plugin (route discovery, AST parse, manifest builder, transform)
src/lib/         Public library
  components/cms/      Display + editable components, scope helpers, store
  components/admin-bar/ Admin bar wrapper + async internal + SEO panel
  server/              loadCms, mockAdapter, types
src/routes/      Test harness / showcase
```

## License

MIT
````
