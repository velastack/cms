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
	layoutDocs: {/* keyed by [locale][routeId] */},
	pageDocs: {/* keyed by [locale][routeId], list of entries */}
});

export const { load: loadCms, generateEntries } = createCms({
	adapter,
	locales: ['en', 'es'] // first entry is the default locale
});
```

```ts
// src/routes/+layout.server.ts
import { error, redirect } from '@sveltejs/kit';
import { loadCms } from '$lib/cms.js';

export const load = async (event) => {
	// Pick the locale however you like — pathname, Accept-Language, cookie, …
	const locale = event.url.searchParams.get('locale') ?? 'en';

	const { cms, notFound, gone, redirectTo } = await loadCms(event, { locale });
	if (redirectTo) redirect(308, redirectTo);
	if (gone) error(410, 'Gone');
	if (notFound) error(404, 'Not found');
	return { cms };
};
```

## `createCms({ adapter, locales })`

Returns:

```ts
type Cms = {
	load: (event: ServerLoadEvent, options: { locale: string }) => Promise<LoadCmsResult>;
	generateEntries: <R extends RouteId>(routeId?: R) => Promise<CmsEntry<RouteParams<R>>[]>;
};
```

- `load(event, { locale })` — call from a `+layout.server.ts` or
  `+page.server.ts`. Reads `event.route.id`, `event.params`, and the
  `?preview=` / `?version=` URL params; resolves the per-request locale from
  the second argument. Returns a `LoadCmsResult` (see below).
- `generateEntries(routeId?)` — wrap with SvelteKit's
  `export const entries = generateEntries`. The Vite plugin substitutes the
  importing file's `routeId` into the zero-arg form at build time. Pass it
  explicitly when you want strongly typed `params`. Always runs against the
  default locale (`locales[0]`).

`locales` is the BCP-47 supported set; the first entry is the **default
locale** used for read-time fallback when a value is missing in the requested
locale.

## `loadCms(event, options)`

Lower-level form of `createCms({...}).load`. Use when you want to bind the
adapter ad-hoc per request:

```ts
import { loadCms } from '@velastack/cms/server';

export const load = (event) =>
	loadCms(event, { adapter, locale: 'es-MX', locales: ['en', 'es-MX'] });
```

### `LoadCmsResult`

```ts
type LoadCmsResult = {
	cms: CmsPayload;
	notFound: boolean;
	gone: boolean;
	redirectTo: string | null;
};
```

The three flags are mutually exclusive page-kind resolutions; consumers
should branch in this priority order:

1. **`redirectTo`** — set to a target URL when the page was replaced with a
   permanent redirect. Caller should `redirect(308, redirectTo)`.
2. **`gone`** — `true` when the page was deliberately permanently removed.
   Caller should `error(410, …)`.
3. **`notFound`** — `true` when the page-kind scope had owned params and the
   adapter returned no doc and no tombstone. Caller should `error(404, …)`.
4. None set — render normally with `cms`.

Layout scopes never tombstone — only page-kind scopes can resolve to `gone`
or `redirectTo`.

## `CmsPayload`

```ts
type CmsPayload = {
	locale: string; // resolved locale for this request
	locales: string[]; // supported set; first entry is the default locale
	docs: Record<string, Record<string, unknown>>; // keyed by scopeId
	scopes: Record<string, CmsScopeEntry>; // keyed by scopeId
	metadata: Record<string, unknown>; // alias of page-scope `metadata` branch
	entries: Record<string, CmsEntry[]>; // keyed by routeId (tombstones filtered)
	endpoint: string;
	page: CmsPagePointer | null;
};
```

## `CmsAdapter` — the backend contract

```ts
interface CmsAdapter {
	readonly endpoint?: string;

	fetchDocs(
		queries: CmsScopeQuery[],
		context: CmsAdapterContext
	): Promise<Record<string, CmsAdapterResolution>> | Record<string, CmsAdapterResolution>;

	fetchEntries(routeId: string, context: CmsAdapterContext): Promise<CmsEntry[]> | CmsEntry[];
}

type CmsAdapterContext = {
	fetch: typeof fetch; // SvelteKit's request-scoped fetch
	previewKey?: string | null; // ?preview=
	versionKey?: string | null; // ?version= (mutually exclusive with previewKey; version wins)
	locale: string; // BCP-47 bound at loadCms({ locale }) time
	locales: string[]; // supported set; first entry is the default locale
};

type CmsScopeQuery = {
	scopeId: string;
	kind: 'layout' | 'page';
	routeId: string;
	params: Record<string, string>; // owned params for this scope only
	fields: string[];
	locale: string; // mirrors context.locale, repeated per query for convenience
};

type CmsAdapterResolution = CmsAdapterDoc | CmsAdapterTombstone;
type CmsAdapterDoc = { contents: Record<string, unknown> };
type CmsAdapterTombstone = { kind: 'gone' } | { kind: 'redirect'; to: string };

type CmsEntry<P = Record<string, string>> = {
	params: P;
	metadata: Record<string, unknown>;
	redirectTo?: string; // set when this entry is a permanent-redirect tombstone
	gone?: boolean; // set when this entry is a 410-gone tombstone
};
```

- **`fetchDocs`** is called once per request with one query per scope in the
  route's chain (root layout → leaf page). Return a map keyed by
  `query.scopeId`. Missing entries fall back to component `fallback`s. A
  page-kind scope may resolve to a `CmsAdapterTombstone` (redirect / gone)
  instead of a doc; the loader short-circuits the page render and surfaces
  the outcome on `LoadCmsResult.{ gone, redirectTo }`.
- **`fetchEntries`** is called from prerender setups via `generateEntries`,
  and by the loader to populate `cms.entries[routeId]`. Return all entries
  including tombstoned ones (with their `redirectTo` / `gone` flag) so
  prerender visits the URL and SvelteKit emits the redirect file. The loader
  filters tombstones out of `cms.entries` before display.

The adapter doesn't need to implement default-locale fallback —
`resolveCmsPayload` issues a parallel default-locale `fetchDocs` /
`fetchEntries` when `locale !== locales[0]` and merges trees on the loader
side. Just return what's stored for the requested locale.

### The `metadata` branch

A page-kind doc may include a `metadata` object on its tree. `loadCms`
aliases it onto `payload.metadata` (handy for `definePageMetaTags(...)`)
without removing it — components addressing `metadata.title` etc. read
straight through. Use it for title, description, canonical, robots.

### Release-preview overlay

When `?preview=KEY` is on the request, `loadCms` forwards
`context.previewKey` to the adapter. Adapters that support preview should:

1. Look up the open release matching the key.
2. For each query, overlay any matching pending edits onto the published
   content (deep-merge plain objects; arrays replace wholesale).
3. Suppress page results that have a staged `page-delete` (or surface its
   `outcome` tombstone if set).

`mockAdapter` does all of this when given a `resolvePreview` function.

### Past-version snapshot (`?version=`)

Mutually exclusive with `previewKey`; when both are present, `versionKey`
wins. Adapters resolve it to a past published release and return that
release's snapshot — no overlay, no drafts.

## Locales

Locales sit between the release dimension and the scope dimension: every
release contains items across every locale you've touched, so publishing
ships all locales atomically.

- **Configure** the supported set with `createCms({ locales })`. First entry
  is the default locale.
- **Pass per-request locale** to `loadCms(event, { locale })`. The library
  doesn't decide how the locale was derived — pathname, `Accept-Language`,
  cookie, `?locale=`, anything.
- **Default-locale fallback** is automatic. When the request's locale isn't
  the default, the loader fetches both locales in parallel and
  `mergeTree(default, requested)`s per scope so missing keys inherit.
  Arrays replace wholesale — an explicit ES gallery overrides EN; an absent
  ES gallery inherits.
- **Tombstones interact with fallback** by precedence: a requested-locale
  tombstone always wins; a default-locale tombstone applies only when the
  requested locale has no doc.
- **`?locale=` URL param** is reserved for the admin bar's preview-locale
  override. The library doesn't read it; the consumer's locale-resolution
  logic is expected to honor it (typical pattern: `?locale=` wins over
  pathname-derived locale when the bar is mounted).

## Tombstones (gone / redirect)

A page-kind URL has four possible outcomes:

| Outcome         | HTTP | Source                                                          |
| --------------- | ---- | --------------------------------------------------------------- |
| Render normally | 200  | Adapter returned `{ contents }` for the page scope.             |
| `redirectTo`    | 308  | Adapter returned `{ kind: 'redirect', to }` for the page scope. |
| `gone`          | 410  | Adapter returned `{ kind: 'gone' }` for the page scope.         |
| `notFound`      | 404  | Adapter returned nothing AND the page scope has owned params.   |

Tombstones come from two places in the adapter:

1. **Published tombstones** — stored on the entry itself
   (`PageEntry.tombstone` in `mockAdapter`). The page was deleted with a
   non-404 outcome in a prior release; `fetchDocs` returns the tombstone
   instead of `{ contents }`.
2. **Staged tombstones** — set on a release's `page-delete` item via
   `outcome` (in `mockAdapter`'s `ReleaseItemSnapshot`). The page is being
   deleted in the open release; in preview, the adapter emits the staged
   outcome. After publish, the staged outcome becomes a published tombstone.
   Omitting `outcome` means hard delete (404).

For prerender, `fetchEntries` returns tombstoned entries with `redirectTo`
or `gone: true` so SvelteKit visits the URL and emits the redirect file
(or surfaces the 410). The consumer-facing `cms.entries[routeId]` filters
them out — `<CmsEntries>` lists never display deleted pages.

## `mockAdapter(options)`

In-memory adapter for tests, demos, and local development:

```ts
type MockAdapterOptions = {
	layoutDocs?: Record<string /* locale */, Record<string /* routeId */, Record<string, unknown>>>;
	pageDocs?: Record<string /* locale */, Record<string /* routeId */, PageEntry[]>>;
	resolvePreview?: (key: string) => ReleaseSnapshot | null | undefined;
};

type PageEntry = {
	params: Record<string, string>;
	published: Record<string, unknown>;
	tombstone?: CmsAdapterTombstone; // mark as a published gone/redirect
};

type ReleaseItemSnapshot =
	| { kind: 'page'; routeId: string; params: Record<string, string>; locale: string; tree: Tree }
	| { kind: 'layout'; routeId: string; locale: string; tree: Tree }
	| {
			kind: 'page-delete';
			routeId: string;
			params: Record<string, string>;
			locale: string;
			outcome?: CmsAdapterTombstone;
	  }; // omit for hard delete (404 after publish)
```

Layout queries are looked up by `[locale][routeId]`; page queries by
`[locale][routeId]` plus exact `params` match. Release items are filtered by
`item.locale === query.locale` so an `es` edit doesn't leak into an `en`
preview. Default-locale fallback is the loader's job, not the adapter's.

```ts
const adapter = mockAdapter({
	layoutDocs: {
		en: { '/': { footer: { copy: '© 2026' } } },
		es: { '/': { footer: { copy: '© 2026' } } }
	},
	pageDocs: {
		en: {
			'/(marketing)/about': [
				{ params: {}, published: { hero: { title: 'About us' }, metadata: { title: 'About us' } } }
			],
			'/(marketing)/rooms/[slug]': [
				{ params: { slug: 'suite-1' }, published: { hero: { title: 'Suite 1' } } },
				// Permanent redirect after a URL change.
				{
					params: { slug: 'legacy' },
					published: {},
					tombstone: { kind: 'redirect', to: '/rooms/suite-1' }
				},
				// Hard 410 — URL is gone for good.
				{ params: { slug: 'old-suite' }, published: {}, tombstone: { kind: 'gone' } }
			]
		}
	}
});
```

Pass `resolvePreview` to enable release-preview overlay. A staged delete
in flight, with a redirect outcome, looks like:

```ts
{
  kind: 'page-delete',
  routeId: '/(marketing)/rooms/[slug]',
  params: { slug: 'legacy' },
  locale: 'en',
  outcome: { kind: 'redirect', to: '/rooms/suite-1' }
}
```

## Stability

Pre-1.0. `createCms`, `loadCms`, `LoadCmsResult`, the `CmsAdapter`
interface, `CmsAdapterResolution` / `CmsAdapterDoc` / `CmsAdapterTombstone`,
`CmsAdapterContext`, `CmsScopeQuery`, `CmsEntry` (including its `redirectTo`
/ `gone` flags), and the page-doc `metadata` branch convention are public;
`mockAdapter` and its option shape are public; everything else is internal.
