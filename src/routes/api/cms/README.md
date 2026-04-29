# `/api/cms/*` — AdminBar HTTP contract

The protocol the AdminBar speaks while editing. The routes shipped here run
against an in-memory mock store (`_store.ts`); a real backend implements the
same endpoints against persistent storage.

All bodies and responses are JSON unless noted. All routes except
`GET /api/cms/docs` require authentication; in the mock that's just a
`cms_session` cookie whose value doubles as the user id, but a real backend
substitutes its own scheme.

## Authentication

| Status | Meaning |
|--------|---------|
| `403`  | Missing or invalid session. Body is empty. |

Apply to every endpoint below unless the row says otherwise.

---

## User

### `GET /api/cms/user`

Whoami for the AdminBar.

**Response 200** `{ user: { id: string; name: string } }`

---

## Docs

### `GET /api/cms/docs`

Fetch one scope's resolved content, optionally with a release-preview overlay.
**Public** — no `cms_session` required (called by the public-facing page when
`?preview=KEY` is on the URL).

**Query**
- `kind` — `"page"` or `"layout"` (required)
- `routeId` — the SvelteKit route id (required, e.g. `/(marketing)/rooms/[slug]`)
- `params` — JSON object of strings (required for `kind=page`; defaults to `{}`)
- `preview` — release preview key (optional)

**Response 200** `{ contents: Record<string, unknown> }`

**Errors**
- `400` malformed `kind`/`routeId`/`params`
- `404` no document for that (`routeId`, `params`, `kind`)

---

## Pages

### `GET /api/cms/pages`

List every page route from the manifest plus the user's editor-level view of
its entries (published + drafts + delete-pending).

**Response 200**
```json
{
  "routes": [{
    "routeId": "/(marketing)/rooms/[slug]",
    "ownedParams": ["slug"],
    "entries": [{
      "params": { "slug": "suite-1" },
      "isDraft": false,
      "isDeletePending": false
    }]
  }]
}
```

Routes are sorted alphabetically by `routeId`; entries within a route are
sorted by serialized params.

### `POST /api/cms/pages`

Create a new page entry as a draft in the user's open release. The page only
materializes in `pageDocs` when the release is published.

**Body** `{ routeId: string; params: Record<string, string>; metadata?: Record<string, unknown> }`

**Response 200** `{ ok: true }`

**Errors**
- `400` missing/invalid `routeId`, `params`, or `metadata`
- `409` `{ "error": "page-exists" }` — params clash with a published entry or
  any open release's draft

### `DELETE /api/cms/pages`

Remove a page from the editor's view. Drafts disappear immediately; published
pages get a `page-delete` item staged in the user's open release (removal
materializes on publish).

**Body** `{ routeId: string; params: Record<string, string> }`

**Response 200**
- `{ ok: true, mode: "draft-discarded" }` — removed an unpublished draft
- `{ ok: true, mode: "delete-staged" }` — staged removal of a published page

**Errors**
- `400` malformed body
- `404` neither a draft nor a published entry exists for the params
- `409` `{ "error": "has-draft" }` — published entry exists but the user also
  has a draft for it; discard the draft first

---

## Releases

### `GET /api/cms/release`

The user's currently-open release, or `null`.

**Response 200** `{ release: OpenRelease | null }`

```ts
type OpenRelease = {
  userId: string;
  name?: string;
  createdAt: string;          // ISO
  preview_key: string;
  items: ReleaseItem[];
};

type ReleaseItem =
  | { kind: 'page';        routeId: string; params: Record<string, string>; fields: Record<string, unknown>; addedAt: string }
  | { kind: 'layout';      routeId: string;                                  fields: Record<string, unknown>; addedAt: string }
  | { kind: 'page-delete'; routeId: string; params: Record<string, string>;                                  addedAt: string };
```

### `POST /api/cms/release/items`

Add or merge edits into the user's open release. Same scope twice → fields
shallow-merge (latest wins). `_metadata` keys inside page items also
shallow-merge so partial metadata edits don't drop sibling keys. Items with
empty `fields` are silently dropped.

**Body**
```ts
{
  items: Array<
    | { kind: 'page';   routeId: string; params: Record<string, string>; fields: Record<string, unknown> }
    | { kind: 'layout'; routeId: string;                                  fields: Record<string, unknown> }
  >;
}
```

**Response 200** `{ release: OpenRelease }`

**Errors**
- `400` malformed JSON, `items` not an array, or any item with bad shape

### `DELETE /api/cms/release/items`

Drop one item from the user's open release.

**Body**
```ts
| { kind: 'page';        routeId: string; params: Record<string, string> }
| { kind: 'layout';      routeId: string }
| { kind: 'page-delete'; routeId: string; params: Record<string, string> }
```

**Response 200** `{ ok: true }`

**Errors**
- `400` malformed body
- `404` no matching item

### `POST /api/cms/release/discard`

Drop the user's entire open release.

**Response 200** `{ ok: boolean }` — `false` when there was nothing to discard.

### `POST /api/cms/release/preview-key`

Rotate the preview key on the user's open release. Old key stops overlaying.

**Response 200** `{ preview_key: string }`

**Errors**
- `404` user has no open release

### `POST /api/cms/release/publish`

Apply every item in the user's open release atomically to the published
content, capture each item's prior fields for revert, append a
`PublishedRelease` to history, and clear the open release.

**Body** (optional) `{ name?: string }`

**Response 200** `{ release: PublishedRelease }`

```ts
type PublishedRelease = {
  id: string;
  name?: string;
  publishedBy: string;
  publishedAt: string;        // ISO
  items: PublishedReleaseItem[];
  revertedAt?: string;        // set when a later release reverts this one
};

type PublishedReleaseItem = (ReleaseItem without addedAt) & {
  priorFields: Record<string, unknown> | null;  // null when this item created an entry
};
```

**Errors**
- `400` malformed `name`
- `404` no open release, or release has zero items

### `GET /api/cms/release/history`

Published releases, sorted descending by `publishedAt`.

**Response 200** `{ history: PublishedRelease[] }`

### `POST /api/cms/release/history/[id]/revert`

Build a brand-new release that inverts the named release's items (last-writer-
wins if subsequent releases edited the same fields), publish it, and mark the
original `revertedAt`.

**Response 200** `{ release: PublishedRelease }`

**Errors**
- `400` missing `id` route param
- `404` release not in history

---

## Lifecycle at a glance

```
                          add items
   ┌──────────────────────────────────────────┐
   │                                          ▼
GET /api/cms/release         ─►   { release: OpenRelease, items: [...] }
                                              │
                                              │ POST /api/cms/release/publish
                                              ▼
                                  { release: PublishedRelease }      ─┐
                                              │                       │
                                              │ POST /history/:id/revert
                                              ▼                       │
                                  { release: <inverse release> }      │
                                                                      │
GET /api/cms/release/history     ◄────────────────────────────────────┘
```

## Preview overlay

The AdminBar opens a preview tab as `<page-url>?preview=<key>`. SvelteKit's
`loadCms` forwards the key as `context.previewKey` to the adapter, which
overlays the matching open release's pending edits onto the published
content for any scope on the page.

## Stability

The endpoint shapes are part of the v1 surface. The `_store.ts` implementation
is intentionally swappable; what's contractual is the request/response JSON
documented above.
