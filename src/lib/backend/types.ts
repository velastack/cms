import type { RequestEvent } from '@sveltejs/kit';
import type { CmsDeployState } from '../core/wire.js';
import type { CmsStore } from './store/queries.js';
import type { SqliteDb } from './store/sqlite.js';

export type { CmsDeployRun, CmsDeployState } from '../core/wire.js';

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
	/** The request being served, for an adapter that needs the host's own
	 * clients (`event.locals`) or the origin it was reached on. */
	event: RequestEvent;
};

/** What the authorization server issued for a sign-in. */
export type CmsOAuthTokens = {
	accessToken: string;
	refreshToken?: string;
	scope?: string;
};

/**
 * Sign-in through an OAuth 2.1 authorization server: a button on the login
 * page, next to the password form or instead of it.
 *
 * The backend is the OAuth client. It sends the person to the authorization
 * server in a popup, exchanges the code it comes back with, and asks
 * `identify` who the token stands for. That editor then gets an ordinary CMS
 * session, so nothing else in the backend or the admin bar knows the
 * difference, and no token ever reaches the browser.
 *
 * The backend names itself by a Client ID Metadata Document it serves at
 * `<mount>/oauth/client.json`, where the authorization server supports those
 * and the mount is on https; otherwise it registers dynamically (RFC 7591).
 */
export type CmsOAuthSignIn = {
	/** The button's text: "Continue with Example". */
	label: string | ((ctx: CmsAuthContext) => string | Promise<string>);
	/** The authorization server's issuer URL. */
	issuer: (ctx: CmsAuthContext) => string | Promise<string>;
	/** The scope to ask for. Its only use is `identify`. */
	scope?: string;
	/** What the authorization server calls this client on its consent page. */
	clientName?: string;
	/**
	 * Who the token stands for, or `null` to refuse the sign-in. The token
	 * was issued to this backend for `resource` (the mount's URL): check that
	 * with the authorization server rather than assume it.
	 */
	identify: (
		tokens: CmsOAuthTokens,
		resource: string,
		ctx: CmsAuthContext
	) => Promise<CmsEditor | null>;
	/** Start a session for an editor `identify` returned. */
	createSession: (
		user: CmsEditor,
		ctx: CmsAuthContext,
		options?: { ttlMs?: number }
	) => Promise<CmsSessionGrant>;
	/** End the session `token` names and return whose it was, or `null`. */
	redeem: (token: string, ctx: CmsAuthContext) => Promise<CmsEditor | null>;
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
	/** May this editor act on this project? A `false` makes the session
	 * anonymous on this project: `required` routes 403, `public` routes serve
	 * published content, and the login page shows its form. */
	authorize(user: CmsEditor, projectId: string, ctx: CmsAuthContext): Promise<boolean>;
	/** Backs the password form of the built-in login page. Omit it, and
	 * `oauth` too, and `/iframe/login` 404s, leaving login entirely to the host. The router runs `authorize` on the grant
	 * before issuing it, so an implementation need not check the project. */
	login?(email: string, password: string, ctx: CmsAuthContext): Promise<CmsSessionGrant | null>;
	/** Sign-in through an authorization server. See `CmsOAuthSignIn`. */
	oauth?: CmsOAuthSignIn;
	/** Throw away a grant `login` minted but the router refused to issue,
	 * because the account has no grant on this project. Optional: without it
	 * the session stays valid server-side, but its token never left the
	 * process. */
	discard?(grant: CmsSessionGrant, ctx: CmsAuthContext): Promise<void>;
	/** Invalidate server-side session state on logout — every session the
	 * request presented, not only the one `cookies.get` returns. The cookie is
	 * cleared regardless. */
	logout?(event: RequestEvent, ctx: CmsAuthContext): Promise<void>;
};

/** Handed to every deploy adapter method. `store` is the CMS store, so the
 * host can read which release is current (`store.getReleaseHistory`). */
export type CmsDeployContext = {
	event: RequestEvent;
	projectId: string;
	user: CmsEditor;
	store: CmsStore;
};

/**
 * The seam between the CMS and whatever rebuilds the site.
 *
 * A static site bakes published content in at build time, so a publish only
 * reaches visitors once the site is built again. The host owns that pipeline;
 * the CMS only exposes it: `status()` backs the admin bar's menu and dialog,
 * `trigger()` starts a run. Throw `CmsDeployError(409, …)` while a run is in
 * flight and `CmsDeployError(503, …)` when the project has nothing to deploy to.
 */
export type CmsDeployAdapter = {
	/** Can this project be deployed from the bar, and what happened last. */
	status(ctx: CmsDeployContext): Promise<CmsDeployState>;
	/** Start a deploy; resolves with the new state. */
	trigger(ctx: CmsDeployContext): Promise<CmsDeployState>;
};

/** A company profile the host manages for a project. `value` is normalized
 * into a `CmsCompanyValue`; `by` names the manager ("VelaBase") and `url` is
 * where it is edited. */
export type CmsManagedCompany = { value: unknown; by: string; url?: string };

export type CmsCompanyOptions = {
	/** The company profile the host manages for this project, or `null` when
	 * the CMS owns it. */
	resolve(
		projectId: string,
		event: RequestEvent
	): Promise<CmsManagedCompany | null> | CmsManagedCompany | null;
};

export type CmsCookieOptions = {
	name?: string;
	/**
	 * Defaults to the mount path (`/cms`, `/v1/projects/<id>/cms`), so projects
	 * sharing an origin hold independent sessions: signing in on one site never
	 * touches another's. While unset, login and logout also expire a
	 * root-scoped cookie left by versions before 0.3.1. Nothing outside the
	 * mount needs it: the site's own server reads through preview and version
	 * keys, never the cookie. Set `'/'` to put it back at the origin root.
	 */
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
	/** Rebuilds and deploys the site from the admin bar. Omit it — the default —
	 * and the bar never shows the action, which is right for a same-origin
	 * mount where the site reads the CMS live. */
	deploy?: CmsDeployAdapter;
	/**
	 * A host that owns the company profile. While `resolve` returns one for a
	 * project, `GET /site` serves it at `company` with `$managed.company` set,
	 * and site writes drop `company`. Omit it and the CMS owns the profile.
	 */
	company?: CmsCompanyOptions;
	cookie?: CmsCookieOptions;
	/**
	 * Cross-origin access. `false` (the default) emits no CORS headers, which is
	 * correct for a same-origin mount.
	 *
	 * Enabling this is a security decision, not a convenience one: the session
	 * cookie is credentialed and the JSON mutation endpoints are not covered by
	 * SvelteKit's CSRF check (it only guards form and missing content types). An `origin`
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
