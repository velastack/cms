/**
 * The HTTP wire contract between the CMS client and the CMS backend.
 *
 * These shapes were previously declared twice — once in
 * `components/cms/cms-store.svelte.ts` for the browser and once in the
 * backend's own `types.ts` — with nothing keeping them in step. Both sides now
 * import from here, so a change to the wire format is a single edit that
 * type-checks against every consumer.
 *
 * Naming follows the wire, not TypeScript convention: `preview_key` and
 * `published_at` stay snake_case because that is what the JSON carries.
 */
import type { Tree } from './path.js';
import type { PageDeleteOutcome, PageEntry } from './page-entry.js';

export type { PageDeleteOutcome };

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

/** One pending change in a release, without the bookkeeping the store adds. */
export type ReleaseItemCore =
	| { kind: 'page'; routeId: string; locale: string; params: Record<string, string>; tree: Tree }
	| { kind: 'layout'; routeId: string; locale: string; tree: Tree }
	| { kind: 'site'; tree: Tree }
	| {
			kind: 'page-delete';
			routeId: string;
			locale: string;
			params: Record<string, string>;
			outcome?: PageDeleteOutcome;
	  };

export type ReleaseItem = ReleaseItemCore & { addedAt: string };

/** The caller's in-flight draft. One per (project, editor). */
export type OpenRelease = {
	userId: string;
	name?: string;
	createdAt: string;
	preview_key: string;
	items: ReleaseItem[];
};

/**
 * A published item, carrying the state it replaced so revert can restore it.
 * `priorTree` is `null` when the item created content that did not exist.
 */
export type PublishedReleaseItem = ReleaseItemCore & {
	priorTree: Tree | null;
	priorTombstone?: PageDeleteOutcome;
};

/**
 * The editor who published a release, captured at publish time. `email` and
 * `name` are null only on rows published before they were recorded, where the
 * account no longer resolves.
 */
export type ReleasePublisher = {
	id: string;
	email: string | null;
	name: string | null;
};

export type PublishedRelease = {
	id: string;
	name?: string;
	publishedBy: ReleasePublisher;
	publishedAt: string;
	preview_key: string;
	items: PublishedReleaseItem[];
	revertedAt?: string;
};

/** Accepted by `POST /release/items`. No `page-delete` — that is staged by
 * `DELETE /pages`, which needs to check the published state first. */
export type AddReleaseItemInput = Extract<
	ReleaseItemCore,
	{ kind: 'page' } | { kind: 'layout' } | { kind: 'site' }
>;

/** Accepted by `DELETE /release/items` — identifies an item without its tree. */
export type DiscardItemTarget =
	| { kind: 'page'; routeId: string; locale: string; params: Record<string, string> }
	| { kind: 'layout'; routeId: string; locale: string }
	| { kind: 'page-delete'; routeId: string; locale: string; params: Record<string, string> }
	| { kind: 'site' };

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export type PageMapEntry = {
	params: Record<string, string>;
	metadata: Record<string, unknown>;
	isDraft: boolean;
	isDeletePending: boolean;
	redirectTo?: string;
	gone?: boolean;
};

/** How the store groups page entries: by route id, no derived fields. */
export type PageMapRoute = {
	routeId: string;
	entries: PageMapEntry[];
};

/**
 * A `/pages` response row. `ownedParams` is derived from the route id's
 * `[param]` segments at response time rather than stored, so it belongs to the
 * wire shape and not to {@link PageMapRoute}.
 */
export type PagesRoute = PageMapRoute & { ownedParams: string[] };

export type CreatePageResult = { ok: true } | { ok: false; reason: 'exists' };

export type StagePageDeleteResult =
	{ ok: true; alreadyStaged: boolean } | { ok: false; reason: 'not-published' | 'has-draft' };

export type RenamePageResult =
	| { ok: true; release: OpenRelease }
	| { ok: false; reason: 'not-found' | 'exists' | 'same-params' };

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * One media library item. `url` is what gets embedded in content trees, so it
 * is whatever the backend's configured media base produces — root-relative
 * (`/cms/uploads/abc.png`) for a same-origin mount, absolute for a
 * cross-origin one.
 */
export type MediaItem = {
	id: string;
	filename: string;
	originalName: string;
	mime: string;
	size: number;
	url: string;
	uploadedAt: string;
	uploadedBy: string;
};

export type ListMediaOptions = { offset?: number; limit?: number };
export type ListMediaResult = { items: MediaItem[]; total: number };

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

/** One build-and-deploy of the site, as the host's deploy adapter reports it. */
export type CmsDeployRun = {
	id: string;
	status: 'pending' | 'building' | 'deployed' | 'failed';
	createdAt: string;
	finishedAt?: string;
	error?: string;
};

/** `GET /deploy` and `POST /deploy`. `available` is `false` when the backend
 * has no deploy adapter, which is how a same-origin mount hides the action. */
export type CmsDeployState = {
	available: boolean;
	site?: { url: string };
	latest?: CmsDeployRun | null;
};

// ---------------------------------------------------------------------------
// Seed / export
// ---------------------------------------------------------------------------

/**
 * A project's published content in one object: `layouts` and `pages` keyed
 * `[locale][routeId]`, plus the non-localised `site` tree. `POST /seed`
 * accepts it and `GET /export` returns it, so a template's published
 * `content/` can seed a fresh project and a project can be dumped back into
 * the same shape. A page keyed by route id may be a bare tree (a static page,
 * `params: {}`) or a full `PageEntry[]`.
 */
export type CmsSeed = {
	layouts?: Record<string, Record<string, Tree>>;
	pages?: Record<string, Record<string, Tree | PageEntry[]>>;
	site?: Tree;
};

export type SeedRequest = CmsSeed & {
	/** Overwrite a project that already has published rows. */
	force?: boolean;
};

export type SeedSummary = {
	locales: string[];
	layouts: number;
	pages: number;
	site: boolean;
};

export type SeedResponse =
	{ ok: true; seeded: SeedSummary } | { ok: false; reason: 'already-seeded' };

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export type DocsResponse = { contents: Tree } | PageDeleteOutcome;
export type SiteResponse = { contents: Tree };
export type PagesResponse = { routes: PagesRoute[] };
export type ReleaseResponse = { release: OpenRelease | null };
export type ReleaseHistoryResponse = { history: PublishedRelease[] };
export type PreviewKeyResponse = { preview_key: string };
export type UserResponse = { user: { id: string; name: string; email: string } };
