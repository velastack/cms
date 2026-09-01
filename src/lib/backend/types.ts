import type { RequestEvent } from '@sveltejs/kit';
import type { SqliteDb } from './store/sqlite.js';

/** An authenticated content editor. */
export type CmsEditor = {
	id: string;
	email: string;
	name: string;
};

/** What a successful login produces: the editor, and the raw session token to
 * put in the cookie. */
export type CmsSessionGrant = {
	user: CmsEditor;
	token: string;
	expiresAt: Date;
};

/** Handed to every adapter method so an implementation can reach the database
 * and know which tenant the request is for without closing over the factory. */
export type CmsAuthContext = {
	db: SqliteDb;
	projectId: string;
	cookieName: string;
};

/**
 * The seam between the CMS and whatever owns identity.
 *
 * `localEditors()` is the built-in implementation, backed by the CMS's own
 * `cms_editors` table. A host that already has accounts — velastack's
 * PocketBase users, say — supplies its own and the router is none the wiser.
 */
export type CmsAuthAdapter = {
	/** Resolve the request's editor, or `null` for anonymous. Must not throw on
	 * a malformed or stale cookie: anonymous is a valid outcome, not an error. */
	resolve(event: RequestEvent, ctx: CmsAuthContext): Promise<CmsEditor | null>;
	/** May this editor act on this project? A `false` here is a 403 before any
	 * handler runs. */
	authorize(user: CmsEditor, projectId: string, ctx: CmsAuthContext): Promise<boolean>;
	/** Backs the built-in login page. Omit it and `/iframe/login` 404s, leaving
	 * login entirely to the host. */
	login?(email: string, password: string, ctx: CmsAuthContext): Promise<CmsSessionGrant | null>;
	/** Invalidate server-side session state on logout. The cookie is cleared
	 * regardless. */
	logout?(event: RequestEvent, ctx: CmsAuthContext): Promise<void>;
};

export type CmsCookieOptions = {
	name?: string;
	path?: string;
	sameSite?: 'lax' | 'strict' | 'none';
	secure?: boolean;
	/** CHIPS. Pairs with `sameSite: 'none'` to survive third-party cookie
	 * deprecation in the embedded-iframe login flow. */
	partitioned?: boolean;
	maxAge?: number;
};

export type CmsCorsOptions = {
	/** Called with the request's `Origin`. Return true to allow it. */
	origin: (origin: string, event: RequestEvent) => boolean;
	methods?: string[];
	headers?: string[];
	credentials?: boolean;
};

export type CmsBackendOptions = {
	/** SQLite file path. `':memory:'` is supported. Ignored when `db` is given.
	 * Defaults to `$VELA_DATA_DIR/cms.sqlite`, else `./data/cms.sqlite`. */
	dbPath?: string;
	/** An already-open connection. Migrations still run against it. */
	db?: SqliteDb;
	/** Where uploaded bytes are written. Defaults to a sibling `uploads/`
	 * directory next to the database. */
	uploadDir?: string;
	/**
	 * Base URL for media, written into `media_items.url` and embedded in
	 * content.
	 *
	 * Defaults to a root-relative `/uploads`, which keeps the origin out of
	 * stored content — an absolute default would bake the authoring origin
	 * (`http://localhost:5173`) into every image added before deploy. Pass an
	 * absolute base when the CMS is served from a different origin than the
	 * site, or to preserve an existing wire format.
	 */
	mediaBaseUrl?: string | ((event: RequestEvent) => string);
	/** Which tenant this request is for. Returning `null` is a 404. Defaults to
	 * the constant `'default'`, which is the single-tenant case. */
	resolveProject?: (event: RequestEvent) => string | null;
	/** Name of the catch-all rest parameter the handlers are mounted under. */
	restParam?: string;
	/** Identity and authorization. Defaults to `localEditors()`. */
	auth?: CmsAuthAdapter;
	cookie?: CmsCookieOptions;
	/**
	 * Cross-origin access. `false` (the default) emits no CORS headers, which is
	 * correct for a same-origin mount.
	 *
	 * Enabling this is a security decision, not a convenience one: the session
	 * cookie is credentialed and the JSON mutation endpoints are not covered by
	 * SvelteKit's CSRF check (it only guards form content types). An `origin`
	 * predicate that returns `true` unconditionally lets any site on the
	 * internet drive those endpoints with a signed-in editor's cookie. Allowlist
	 * the origins you actually serve.
	 */
	cors?: false | CmsCorsOptions;
	/** `frame-ancestors` for the login pages. Defaults to `'self'`; the
	 * cross-origin admin bar needs the embedding site (or `*`). */
	frameAncestors?: string;
	/** Expose `POST /__test_reset__`. Never enable in production. */
	testReset?: boolean;
};
