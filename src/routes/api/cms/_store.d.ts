import { type CmsStatus, type PageEntry } from '$lib/server/mock-adapter.js';
export type CmsVersionSummary = {
    version: number;
    status: CmsStatus;
    preview_key: string;
};
export declare const generatePreviewKey: () => string;
export declare const layoutDocs: Record<string, Record<string, unknown>>;
export declare const pageDocs: Record<string, PageEntry[]>;
export declare const listPageVersions: (routeId: string, params: Record<string, string>) => CmsVersionSummary[];
/**
 * List the bound values seen in `pageDocs` for one `[param]` of a given route.
 * Used for SvelteKit page-entry generation: given `routeId` like
 * `/(marketing)/rooms/[slug]` and `param: 'slug'`, returns every distinct
 * slug value for which a page document exists.
 */
export declare const listPageParamValues: (routeId: string, param: string) => string[];
export type DraftEntry = {
    scopeId: string;
    routeId: string;
    params: Record<string, string>;
    fields: Record<string, unknown>;
};
export type PageSaveTarget = {
    scopeId: string;
    routeId: string;
    params: Record<string, string>;
    baseVersion: number | null;
};
export type SavedPageVersion = {
    scopeId: string;
    routeId: string;
    params: Record<string, string>;
    version: number;
    preview_key: string;
};
export type SaveDraftsResult = {
    pageVersion?: SavedPageVersion;
};
/**
 * Apply a save batch from the admin bar.
 *
 * Layout entries are mutated in place (no versioning). The page entry — at
 * `page.routeId` + `page.params`, if any — is either updated in place when
 * `page.baseVersion` still points at a draft, or forked into a fresh draft
 * otherwise (next version, new `preview_key`, contents = base contents merged
 * with the incoming drafts and metadata).
 *
 * Status is always re-read from the store, never trusted from the client.
 */
export declare const saveDrafts: (drafts: DraftEntry[], metadata: DraftEntry[], page: PageSaveTarget | null) => SaveDraftsResult;
