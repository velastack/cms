# `@velastack/cms/server` — server-side runtime

The piece that runs inside SvelteKit's server load. Reads the build-time
manifest produced by [`@velastack/cms/vite`](../../../plugin/README.md), asks a
backend-agnostic adapter for the relevant docs, and shapes a `CmsPayload`
the runtime CMS components consume via `getContext(CMS_SCOPE)`.

```ts
import { createCms, mockAdapter } from '@velastack/cms/server';
```

## Quick start

```ts
// src/lib/cms.ts
import { createCms, mockAdapter } from '@velastack/cms/server';

const adapter = mockAdapter({
  layoutDocs: { /* keyed by routeId */ },
  pageDocs:   { /* keyed by routeId, list of entries */ }
});

export const { load: loadCms, generateEntries } = createCms({
  adapter,
  locale: 'en'
});
```

```ts
// src/routes/+layout.server.ts
import { error } from '@sveltejs/kit';
import { loadCms } from '$lib/cms.js';

export const load = async (event) => {
  const { cms, notFound } = await loadCms(event);
  if (notFound) error(404, 'Not found');
  return { cms };
};
```

## `createCms({ adapter, locale })`

Returns:

```ts
type Cms = {
  load: (event: ServerLoadEvent) => Promise<{ cms: CmsPayload; notFound: boolean }>;
  generateEntries: <R extends RouteId>(routeId?: R) => Promise<CmsEntry<RouteParams<R>>[]>;
};
```

- `load(event)` — call from a `+layout.server.ts` or `+page.server.ts`. Reads
  `event.route.id`, `event.params`, and `event.url.searchParams.get('preview')`.
  When `notFound` is true, the page-kind scope had owned params and the adapter
  returned no document for them — caller should `error(404, …)`.
- `generateEntries(routeId?)` — wrap with SvelteKit's
  `export const entries = generateEntries`. The Vite plugin substitutes the
  importing file's `routeId` into the zero-arg form at build time. Pass it
  explicitly when you want strongly typed `params`.

## `loadCms(event, options)`

Lower-level form of `createCms({...}).load`. Use when you want a different
locale per request without re-binding the adapter:

```ts
import { loadCms } from '@velastack/cms/server';

export const load = (event) => loadCms(event, { adapter, locale: 'es-MX' });
```

## `CmsAdapter` — the backend contract

```ts
interface CmsAdapter {
  fetchDocs(
    queries: CmsScopeQuery[],
    context: CmsAdapterContext
  ): Promise<Record<string, CmsAdapterDoc>> | Record<string, CmsAdapterDoc>;

  fetchEntries(
    routeId: string,
    context: CmsAdapterContext
  ): Promise<CmsEntry[]> | CmsEntry[];
}

type CmsAdapterContext = {
  fetch: typeof fetch;     // SvelteKit's request-scoped fetch
  previewKey?: string | null;
};

type CmsScopeQuery = {
  scopeId: string;
  kind: 'layout' | 'page';
  routeId: string;
  params: Record<string, string>;   // owned params for this scope only
  fields: string[];
  metadata?: string[];
  locale: string;
};

type CmsAdapterDoc = { contents: Record<string, unknown> };

type CmsEntry<P = Record<string, string>> = {
  params: P;
  metadata: Record<string, unknown>;
};
```

- **`fetchDocs`** is called once per request with one query per scope in the
  route's chain (root layout → leaf page). Return a map keyed by
  `query.scopeId`. Missing entries fall back to component `fallback`s.
- **`fetchEntries`** is called from prerender setups via `generateEntries`. It
  enumerates the publishable entries at one route id (with their bound owned
  params and `_metadata` map).

### The reserved `_metadata` key

A page-kind doc may include `_metadata` in its `contents`. `loadCms` lifts it
onto `payload.metadata` and removes it from the doc map before components see
it. Use it for `definePageMetaTags(...)` (title, description, canonical, robots).

### Release-preview overlay

When `?preview=KEY` is on the request, `loadCms` forwards
`context.previewKey` to the adapter. Adapters that support preview should:

1. Look up the open release matching the key.
2. For each query, overlay any matching pending edits onto the published
   content (shallow merge; `_metadata` sub-merges so partial edits don't drop
   sibling keys).
3. Suppress page results that have a staged `page-delete`.

`mockAdapter` does all of this when given a `resolvePreview` function.

## `mockAdapter(options)`

In-memory adapter for tests, demos, and local development:

```ts
type MockAdapterOptions = {
  layoutDocs?: Record<string, Record<string, unknown>>;
  pageDocs?: Record<string, PageEntry[]>;
  resolvePreview?: (key: string) => ReleaseSnapshot | null | undefined;
};

type PageEntry = {
  params: Record<string, string>;
  published: Record<string, unknown>;
};
```

Layout queries are looked up by `routeId`; page queries by `routeId` plus
exact `params` match. Pass `resolvePreview` to enable release-preview overlay.

## Stability

Pre-1.0. `createCms`, `loadCms`, the `CmsAdapter` interface, `CmsScopeQuery`,
`CmsEntry`, and the `_metadata` reserved key are public; `mockAdapter` and
its option shape are public; everything else is internal.
