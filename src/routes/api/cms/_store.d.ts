import { type PageEntry, type ReleaseSnapshot } from '$lib/server/mock-adapter.js';
export declare const generatePreviewKey: () => string;
export declare const layoutDocs: Record<string, Record<string, unknown>>;
export declare const pageDocs: Record<string, PageEntry[]>;
/**
 * One pending change in an open release. `page` and `layout` items hold
 * field edits (a flat map; page items may include a reserved `_metadata`
 * key) and shallow-merge into existing items for the same scope. The
 * `page-delete` variant stages a published-page removal — it carries no
 * fields and only takes effect on publish.
 *
 * `addedAt` is updated whenever the item is added or its fields are merged,
 * so it tracks the most recent edit to that scope. The publish modal uses
 * this for the per-row "edited 2 minutes ago" meta line.
 */
type ReleaseItemCore = {
    kind: 'page';
    routeId: string;
    params: Record<string, string>;
    fields: Record<string, unknown>;
} | {
    kind: 'layout';
    routeId: string;
    fields: Record<string, unknown>;
} | {
    kind: 'page-delete';
    routeId: string;
    params: Record<string, string>;
};
export type ReleaseItem = ReleaseItemCore & {
    addedAt: string;
};
export type OpenRelease = {
    userId: string;
    name?: string;
    createdAt: string;
    preview_key: string;
    items: ReleaseItem[];
};
export type PublishedReleaseItem = ReleaseItemCore & {
    /** The fields' values immediately before this release was applied; null
     * for page items where no published entry existed yet. Used by revert. */
    priorFields: Record<string, unknown> | null;
};
export type PublishedRelease = {
    id: string;
    name?: string;
    publishedBy: string;
    publishedAt: string;
    items: PublishedReleaseItem[];
    revertedAt?: string;
};
export declare const openReleases: Record<string, OpenRelease>;
export declare const releaseHistory: PublishedRelease[];
export declare const getOpenRelease: (userId: string) => OpenRelease | null;
/**
 * Look up an open release by its preview key (any user). Used by the adapter
 * to overlay pending edits when a request carries `?preview=…`.
 */
export declare const lookupReleaseByPreviewKey: (key: string) => ReleaseSnapshot | null;
/**
 * Look up an open release directly. Used by the docs endpoint to overlay a
 * single scope without a full release snapshot trip.
 */
export declare const findOpenReleaseByPreviewKey: (key: string) => OpenRelease | null;
export type AddReleaseItemInput = {
    kind: 'page';
    routeId: string;
    params: Record<string, string>;
    fields: Record<string, unknown>;
} | {
    kind: 'layout';
    routeId: string;
    fields: Record<string, unknown>;
};
/**
 * Add or merge items into the user's open release. New scopes get a new
 * item; existing scopes get their fields shallow-merged (latest value wins),
 * so saving the same field twice keeps the second value. `_metadata` keys
 * inside page items also shallow-merge so partial metadata edits don't drop
 * other keys.
 */
export declare const addReleaseItems: (userId: string, inputs: AddReleaseItemInput[]) => OpenRelease;
export type DiscardItemTarget = {
    kind: 'page';
    routeId: string;
    params: Record<string, string>;
} | {
    kind: 'layout';
    routeId: string;
} | {
    kind: 'page-delete';
    routeId: string;
    params: Record<string, string>;
};
/** Drop one item from the user's open release. */
export declare const discardReleaseItem: (userId: string, target: DiscardItemTarget) => boolean;
/** Drop the entire open release for a user. */
export declare const discardOpenRelease: (userId: string) => boolean;
/** Rotate the preview key on the user's open release. Returns the new key,
 * or null if there's no open release. */
export declare const regeneratePreviewKey: (userId: string) => string | null;
/**
 * Apply every item in the user's open release atomically to `pageDocs` /
 * `layoutDocs`, capture each item's prior fields for revert, append to
 * history, and clear the open release.
 *
 * Returns the new `PublishedRelease`, or null if there's nothing to publish.
 */
export declare const publishRelease: (userId: string, name?: string) => PublishedRelease | null;
export declare const getReleaseHistory: () => PublishedRelease[];
/**
 * Build a brand-new release containing the inverse of a published release's
 * items, then publish it. Restores each touched field to its captured prior
 * value (last-writer-wins if subsequent releases edited the same fields —
 * acceptable for v1).
 */
export declare const revertRelease: (releaseId: string, userId: string) => PublishedRelease | null;
/**
 * List the bound values seen in `pageDocs` for one `[param]` of a given route.
 * Used for SvelteKit page-entry generation: given `routeId` like
 * `/(marketing)/rooms/[slug]` and `param: 'slug'`, returns every distinct
 * slug value for which a page document exists.
 */
export declare const listPageParamValues: (routeId: string, param: string) => string[];
export type CreatePageResult = {
    ok: true;
} | {
    ok: false;
    reason: 'exists';
};
/**
 * Stage a brand-new page at `routeId` + `params` as a release item in the
 * user's open release. The page only enters `pageDocs` when the release is
 * published — until then it's invisible to public traffic and visible to the
 * editor (and anyone with the preview key) via the overlay path. Refuses if
 * a published entry with the exact same params already exists, or if any
 * other open release already has a pending item for the same scope.
 */
export declare const createPage: (userId: string, routeId: string, params: Record<string, string>, metadata?: Record<string, unknown>) => CreatePageResult;
export type StagePageDeleteResult = {
    ok: true;
    alreadyStaged: boolean;
} | {
    ok: false;
    reason: 'not-published' | 'has-draft';
};
/**
 * Stage a `page-delete` item in the user's open release. The published page
 * stays live until the release is published; in the meantime the editor (and
 * preview-key holders) see the page as removed via the adapter overlay.
 * Refuses if the page isn't actually published, or if the user has a draft
 * `page` item for the same scope (the caller should discard the draft via
 * `discardReleaseItem` instead — drafts have nothing to delete).
 */
export declare const stagePageDelete: (userId: string, routeId: string, params: Record<string, string>) => StagePageDeleteResult;
export type PageMapEntry = {
    params: Record<string, string>;
    isDraft: boolean;
    isDeletePending: boolean;
};
export type PageMapRoute = {
    routeId: string;
    entries: PageMapEntry[];
};
/**
 * Empty all four stores in place. The references in {@link layoutDocs},
 * {@link pageDocs}, {@link openReleases}, and {@link releaseHistory} are
 * preserved (the mockAdapter and route handlers captured them at import
 * time). Tests call this in `beforeEach` to start from a known clean
 * baseline, then seed whatever they need by mutating the same exported
 * objects.
 */
export declare const __resetStoreForTests: () => void;
/**
 * Walk every published page entry plus every `page` / `page-delete` item in
 * the user's open release, producing a per-route view of the editor's site
 * map. `isDraft` flags entries that exist only in the open release (not yet
 * published); `isDeletePending` flags published entries with a staged
 * removal. Routes are alphabetical; entries within a route are alphabetical
 * by serialized params.
 */
export declare const listAllPages: (userId: string) => PageMapRoute[];
export {};
