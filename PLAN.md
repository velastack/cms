# VelaCMS

MOST IMPORTANT: This is unreleased and still under development. The main goal is to making two things very painless:

1. Integration in a SvelteKit site. Should be as dead simple as possible. When we think we're zero-config, we can maybe go even further.

2. For the end user to use the CMS.

To this end, we'll continue to refine and simplify the public interfaces this library exposes.

## Background

Vela CMS components are authored directly in Svelte components:

```svelte
<CmsText name="header.title" fallback="VelaStack CMS" />
<CmsRichText name="body" />
<CmsImage name="hero.image" />
```

The developer should not manually pass CMS scope, route IDs, filenames, or layout metadata.

At runtime, each CMS component should:

1. Find its current CMS scope.
2. Read its value from `page.data.cms`.
3. Render the value or fallback.
4. In edit mode, write changes back using a canonical binding key.

The difficult part is that a component like `Header.svelte` may be reused in different layouts:

```txt
src/routes/(marketing)/+layout.svelte → Header.svelte
src/routes/(app)/+layout.svelte       → Header.svelte
```

Both may contain:

```svelte
<CmsText name="header.title" />
```

Those are not the same CMS field. They share the same component file and field name, but belong to different route scopes.

Therefore, CMS identity must be based on **usage scope**, not declaration filename.

---

## Core model

Persisted CMS identity is:

```txt
site_id + locale + scope_id + field_path
```

Examples:

```txt
site=demo | locale=en | scope=layout:/                  | field=footer.links
site=demo | locale=es | scope=layout:/(marketing)       | field=header.title
site=demo | locale=es | scope=page:/(marketing)/about   | field=hero.title
site=demo | locale=es | scope=page:/(marketing)/rooms/[slug]?slug=suite-1 | field=hero.title
```

Do **not** use:

```txt
filename + component key
```

That fails when reusable components appear in multiple route scopes.

---

## Build a Vite plugin

Implement a Vite plugin that scans SvelteKit route files and generates a CMS manifest.

The plugin should:

1. Discover SvelteKit route entrypoints:
   - `+layout.svelte`
   - `+page.svelte`
   - eventually `+page@...svelte` and `+layout@...svelte`

2. Parse each route/component file with `svelte/compiler`.

3. Walk static Svelte component imports from each route entrypoint.

4. Find CMS components:
   - `CmsText`
   - `CmsRichText`
   - `CmsImage`
   - `CmsRepeater`
   - later others

5. Attribute each discovered CMS field to the **route entrypoint scope that reached it**.

6. Generate a virtual module:

```ts
// virtual:vela-cms/manifest
export const cmsManifest = {
	version: 1,
	routes: {
		'/(marketing)/about': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'layout:/(marketing)',
					kind: 'layout',
					routeId: '/(marketing)',
					ownedParams: [],
					fields: ['header.title', 'announcement.text']
				},
				{
					scopeId: 'page:/(marketing)/about',
					kind: 'page',
					routeId: '/(marketing)/about',
					ownedParams: [],
					fields: ['hero.title', 'body']
				}
			]
		},

		'/(marketing)/rooms/[slug]': {
			scopes: [
				{
					scopeId: 'layout:/',
					kind: 'layout',
					routeId: '/',
					ownedParams: [],
					fields: ['footer.links']
				},
				{
					scopeId: 'layout:/(marketing)',
					kind: 'layout',
					routeId: '/(marketing)',
					ownedParams: [],
					fields: ['header.title']
				},
				{
					scopeId: 'page:/(marketing)/rooms/[slug]',
					kind: 'page',
					routeId: '/(marketing)/rooms/[slug]',
					ownedParams: ['slug'],
					fields: ['hero.title', 'gallery.items']
				}
			]
		}
	}
};
```

---

## Runtime loader

The root server load calls one CMS loader:

```ts
// the cmsManifest virtual module import should be within loadCmsForRoute
import { cmsManifest } from 'virtual:vela-cms/manifest';
import { loadCmsForRoute } from '$lib/vela-cms/server';

export const load = async (event) => {
	const locale = resolveLocale(event);

	return {
		locale,
		cms: await loadCmsForRoute({
			manifest: cmsManifest,
			siteId: event.locals.site.id,
			routeId: event.route.id,
			params: event.params,
			locale
		})
	};
};
```

`loadCmsForRoute` should:

1. Look up `cmsManifest.routes[routeId]`.
2. For each scope, pick only `ownedParams`.
3. Compose scope keys.
4. Batch fetch all CMS documents.
5. Return one payload:

```ts
type CmsPayload = {
	locale: string;
	docs: Record<string, unknown>;
	scopes: Record<
		string,
		{
			scopeId: string;
			scopeKey: string;
			kind: 'layout' | 'page';
			routeId: string;
			params: Record<string, string>;
			fields: string[];
		}
	>;
};
```

---

## Runtime component binding

The authored API stays minimal:

```svelte
<CmsText name="header.title" />
```

The Vite plugin may transform CMS component usage internally.

For route/layout/page components, inject CMS scope context using Svelte context. This adds no DOM markup.

Example transformed layout:

```svelte
<script>
	import { setContext } from 'svelte';
	import { CMS_SCOPE } from 'virtual:vela-cms/runtime';
	import Header from '$lib/Header.svelte';

	setContext(CMS_SCOPE, {
		scopeId: 'layout:/(marketing)'
	});
</script>

<Header />
{@render children()}
```

Then CMS components read:

```ts
const scope = getContext(CMS_SCOPE);
const data = page.data.cms;
const value = getCmsValue(data, scope.scopeId, name);
```

For editing, post back:

```ts
await saveCmsField({
	siteId,
	locale,
	scopeId: scope.scopeId,
	fieldPath: name,
	value
});
```

The server must validate `scopeId + fieldPath` against the generated manifest before writing.

---

## Examples

### Root layout + homepage

Files:

```txt
src/routes/+layout.svelte
src/routes/+page.svelte
```

Usage:

```svelte
<!-- +layout.svelte -->
<CmsText name="header.title" />
<CmsRepeater name="footer.links" />

<!-- +page.svelte -->
<CmsText name="hero.title" />
<CmsRichText name="body" />
```

Manifest:

```txt
route: /
scopes:
- layout:/ → header.title, footer.links
- page:/   → hero.title, body
```

---

### Marketing layout + about page

Files:

```txt
src/routes/+layout.svelte
src/routes/(marketing)/+layout.svelte
src/routes/(marketing)/about/+page.svelte
```

Manifest:

```txt
route: /(marketing)/about
scopes:
- layout:/                  → footer.links
- layout:/(marketing)       → header.title, announcement.text
- page:/(marketing)/about   → hero.title, body
```

---

### Shared header reused in app and marketing

Files:

```txt
src/lib/Header.svelte
src/routes/(marketing)/+layout.svelte
src/routes/(app)/+layout.svelte
```

`Header.svelte`:

```svelte
<CmsText name="header.title" />
```

Generated bindings:

```txt
layout:/(marketing) # header.title
layout:/(app)       # header.title
```

Same component. Same CMS key. Different usage scope. Different stored content.

---

### Dynamic page

File:

```txt
src/routes/(marketing)/rooms/[slug]/+page.svelte
```

Usage:

```svelte
<CmsText name="hero.title" />
<CmsImage name="hero.image" />
```

Runtime route:

```txt
/rooms/suite-1
```

Binding:

```txt
scope=page:/(marketing)/rooms/[slug]
params={ slug: "suite-1" }
field=hero.title
locale=es
```

---

## Constraints for v1

Keep the static analysis conservative.

Supported:

```svelte
<CmsText name="hero.title" />
<CmsText name={'hero.title'} />
```

Not supported initially:

```svelte
<CmsText name={`features.${i}.title`} />
<svelte:component this={DynamicComponent} />
```

For repeatable content, prefer explicit CMS collection components:

```svelte
<CmsRepeater name="nav.items" let:item>
	<CmsText name="label" value={item.label} />
</CmsRepeater>
```

Internally, collection items need stable IDs. Avoid persisted paths like:

```txt
nav.items[0].label
```

Prefer:

```txt
nav.items[id=about].label
```

---

## Security

The client must not be trusted.

On save, the server must verify:

1. The user can edit this site.
2. The locale is enabled.
3. The submitted `scopeId` exists in the generated manifest.
4. The submitted `fieldPath` exists in that scope.
5. The field type matches the CMS component type.
6. The value passes validation.

The manifest is the allowlist.

---

## Implementation notes

Start with:

1. Static route scan.
2. Svelte AST parse.
3. Static import graph for `.svelte` components.
4. CMS component extraction.
5. Virtual manifest module.
6. `loadCmsForRoute`.
7. Runtime CMS components reading from `page.data.cms`.
8. Save endpoint with manifest validation.

Defer:

1. Layout reset handling.
2. Dynamic component tracing.
3. Type generation.
4. Overlay instance IDs.
5. HMR optimization.
6. Advanced collection editing.
7. Generated `.d.ts` field-name autocomplete.

The first milestone should prove this:

```txt
A CmsText inside src/lib/Header.svelte loads different content when Header is used from /(marketing)/+layout.svelte versus /(app)/+layout.svelte, without the developer passing scope manually.
```

# Addition: Page Metadata for Vela CMS

Implement editable page metadata as **page-scoped only**.

## Rule

Metadata belongs to the exact page route instance, not layouts.

Canonical identity:

```txt
site_id + locale + page_route_id + owned_params + metadata_key
```

Do not create layout-scoped editable metadata in v1.

## Rationale

CMS layout content can be nested because visual components compose through layouts. Metadata describes the final document, so inheritance from layouts creates confusing merge/precedence rules.

Use this resolution order instead:

```txt
editable page metadata
→ static route/template defaults
→ static site defaults
```

## Manifest addition

Extend page scope entries with metadata fields:

```ts
{
  scopeId: 'page:/(marketing)/about',
  kind: 'page',
  routeId: '/(marketing)/about',
  ownedParams: [],
  fields: ['hero.title', 'body'],
  metadata: ['title', 'description', 'ogImage', 'canonical', 'robots']
}
```

Layout scopes should not have `metadata`.

## Loader behavior

Load the page metadata from the CMS. Many SvelteKit websites use svelte-meta-tags to manage metadata, so we can make it very easy to integrate with it.

`loadCmsForRoute` should return the page metadata as well.

```ts
export const load = async (event) => {
	const { baseMetaTags } = defineBaseMetaTags({
		title: 'Default'
	});

	const cms = await loadCmsForRoute({
		routeId: event.route.id,
		params: event.params as Record<string, string>,
		locale: 'en',
		fetchDocs
	});

	// mock cms.metadata
	// @ts-ignore
	cms.metadata = {
		title: 'Title from CMS'
	};

	// @ts-ignore
	const { pageMetaTags } = definePageMetaTags(cms.metadata);

	return {
		baseMetaTags,
		pageMetaTags,
		cms
	};
};
```

## Editing

The CMS editor SEO panel edits the current page’s metadata.
