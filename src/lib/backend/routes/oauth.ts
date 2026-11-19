/**
 * Sign-in through an OAuth 2.1 authorization server, for a host whose editors
 * already have accounts somewhere (`auth.oauth`; see `CmsOAuthSignIn`).
 *
 * The backend is the OAuth client and the browser never holds a token:
 *
 * 1. The login page (in the admin bar's iframe) opens `<mount>/oauth/start`
 *    in a popup. A popup, because the authorization server's own sign-in needs
 *    its first-party cookies, which a frame inside someone else's site is not
 *    given.
 * 2. `start` sends the popup to the authorization server with a PKCE
 *    challenge, keeping the verifier in a short-lived cookie.
 * 3. The person signs in and agrees there, and the popup comes back to
 *    `<mount>/oauth/callback` with a code, which is exchanged here.
 * 4. `identify` says who the token stands for. If they may edit this site,
 *    the popup hands the login page a one-time token and closes; the login
 *    page posts it back and gets the session cookie.
 *
 * The last step is a hand-off rather than a cookie set by the popup because
 * browsers keep a framed page's cookies apart from the same site's own: a
 * cookie the popup set would not be the one the admin bar's requests carry.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CmsAuthContext, CmsOAuthSignIn } from '../types.js';
import { escapeHtml, html, page } from './login.js';
import type { RouteCtx } from './context.js';

/** How long the round trip to the authorization server may take. */
const STATE_TTL_SECONDS = 10 * 60;
/** How long the popup's hand-off to the login page is good for. */
const HANDOFF_TTL_MS = 60 * 1000;

const base64url = (bytes: Buffer) => bytes.toString('base64url');

/** What `start` remembers for `callback`, in a cookie only this mount is sent. */
type Pending = { state: string; verifier: string; issuer: string; clientId: string };

type ServerMetadata = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	revocation_endpoint?: string;
	client_id_metadata_document_supported?: boolean;
};

const stateCookie = (ctx: RouteCtx) => `${ctx.authCtx.cookieName}_oauth`;

const stateCookieOptions = (ctx: RouteCtx) => ({
	path: ctx.mountPath || '/',
	httpOnly: true,
	// The way back from the authorization server is a top-level navigation,
	// which is exactly what Lax lets a cookie ride.
	sameSite: 'lax' as const,
	secure: ctx.event.url.protocol === 'https:'
});

/** The mount's own URL: the OAuth client's home, and the resource it asks tokens for. */
const mountUrl = (ctx: RouteCtx) => ctx.event.url.origin + ctx.mountPath;
const redirectUri = (ctx: RouteCtx) => `${mountUrl(ctx)}/oauth/callback`;
const clientDocumentUrl = (ctx: RouteCtx) => `${mountUrl(ctx)}/oauth/client.json`;

const clientMetadata = (ctx: RouteCtx, oauth: CmsOAuthSignIn) => ({
	client_name: oauth.clientName ?? `Website editor (${ctx.event.url.host})`,
	redirect_uris: [redirectUri(ctx)],
	grant_types: ['authorization_code'],
	response_types: ['code'],
	token_endpoint_auth_method: 'none'
});

const resolveLabel = async (oauth: CmsOAuthSignIn, ctx: CmsAuthContext): Promise<string> =>
	typeof oauth.label === 'function' ? await oauth.label(ctx) : oauth.label;

/** The button's text, for the login page. */
export const oauthLabel = async (ctx: RouteCtx): Promise<string | null> =>
	ctx.auth.oauth ? resolveLabel(ctx.auth.oauth, ctx.authCtx) : null;

async function serverMetadata(ctx: RouteCtx, issuer: string): Promise<ServerMetadata> {
	const response = await ctx.event.fetch(`${issuer}/.well-known/oauth-authorization-server`, {
		headers: { accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`authorization server metadata answered ${response.status}`);
	const metadata = (await response.json()) as ServerMetadata;
	// A document that names another issuer was served by something else.
	if (metadata.issuer !== issuer) throw new Error('authorization server metadata issuer mismatch');
	if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
		throw new Error('authorization server metadata is incomplete');
	}
	return metadata;
}

/**
 * Clients registered dynamically, by issuer and redirect URI. Remembered for
 * a day and no longer: a server may drop a registration nobody holds a grant
 * under, and this client gives every grant back as soon as it has been used.
 */
const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
const registered = new Map<string, { clientId: string; until: number }>();

/**
 * The client id to use with this authorization server: the URL of the
 * document `getClientDocument` serves, where the server reads those and the
 * mount is on https (a document's URL has to be), else one registered now.
 */
async function clientId(ctx: RouteCtx, oauth: CmsOAuthSignIn, metadata: ServerMetadata) {
	if (metadata.client_id_metadata_document_supported && ctx.event.url.protocol === 'https:') {
		return clientDocumentUrl(ctx);
	}
	if (!metadata.registration_endpoint) {
		throw new Error('the authorization server offers no way to register this client');
	}
	const key = `${metadata.issuer} ${redirectUri(ctx)}`;
	const known = registered.get(key);
	if (known && known.until > Date.now()) return known.clientId;
	const response = await ctx.event.fetch(metadata.registration_endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(clientMetadata(ctx, oauth))
	});
	if (!response.ok) throw new Error(`client registration answered ${response.status}`);
	const { client_id } = (await response.json()) as { client_id?: string };
	if (!client_id) throw new Error('client registration returned no client_id');
	registered.set(key, { clientId: client_id, until: Date.now() + REGISTRATION_TTL_MS });
	return client_id;
}

const popupPage = (ctx: RouteCtx, title: string, message: string, status = 200): Response =>
	html(
		page(title, `<h1>${escapeHtml(title)}</h1>\n<p class="sub">${escapeHtml(message)}</p>`),
		ctx,
		status,
		// The popup is its own window; nothing has a reason to frame it.
		"'none'"
	);

const failed = (ctx: RouteCtx, message: string, status = 400): Response =>
	popupPage(ctx, 'Could not sign in', message, status);

/** `GET /oauth/client.json`: the Client ID Metadata Document of this mount. */
export const getClientDocument = (ctx: RouteCtx): Response => {
	const oauth = ctx.auth.oauth;
	if (!oauth) return new Response(null, { status: 404 });
	return Response.json(
		{ client_id: clientDocumentUrl(ctx), ...clientMetadata(ctx, oauth) },
		{ headers: { 'cache-control': 'public, max-age=3600' } }
	);
};

/** `GET /oauth/start`: off to the authorization server, in the popup. */
export const getOAuthStart = async (ctx: RouteCtx): Promise<Response> => {
	const oauth = ctx.auth.oauth;
	if (!oauth) return new Response(null, { status: 404 });

	let metadata: ServerMetadata;
	let client: string;
	const issuer = (await oauth.issuer(ctx.authCtx)).replace(/\/+$/, '');
	try {
		metadata = await serverMetadata(ctx, issuer);
		client = await clientId(ctx, oauth, metadata);
	} catch (error) {
		console.error('[cms oauth] could not start sign-in', error);
		return failed(ctx, 'Sign-in is not available right now. Try again in a moment.', 502);
	}

	const verifier = base64url(randomBytes(32));
	const pending: Pending = {
		state: base64url(randomBytes(16)),
		verifier,
		issuer,
		clientId: client
	};
	ctx.event.cookies.set(stateCookie(ctx), base64url(Buffer.from(JSON.stringify(pending))), {
		...stateCookieOptions(ctx),
		maxAge: STATE_TTL_SECONDS
	});

	const authorize = new URL(metadata.authorization_endpoint);
	authorize.search = new URLSearchParams({
		response_type: 'code',
		client_id: client,
		redirect_uri: redirectUri(ctx),
		code_challenge: base64url(createHash('sha256').update(verifier).digest()),
		code_challenge_method: 'S256',
		state: pending.state,
		resource: mountUrl(ctx),
		...(oauth.scope ? { scope: oauth.scope } : {})
	}).toString();

	return new Response(null, {
		status: 302,
		headers: { location: authorize.href, 'cache-control': 'no-store' }
	});
};

const sameString = (a: string, b: string) =>
	a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** `GET /oauth/callback`: back from the authorization server, in the popup. */
export const getOAuthCallback = async (ctx: RouteCtx): Promise<Response> => {
	const oauth = ctx.auth.oauth;
	if (!oauth) return new Response(null, { status: 404 });
	const { event } = ctx;
	const query = event.url.searchParams;

	let pending: Pending | null = null;
	try {
		const raw = event.cookies.get(stateCookie(ctx));
		pending = raw ? (JSON.parse(Buffer.from(raw, 'base64url').toString()) as Pending) : null;
	} catch {
		pending = null;
	}
	// Whatever happens next, this attempt is over.
	event.cookies.set(stateCookie(ctx), '', { ...stateCookieOptions(ctx), maxAge: 0 });

	const state = query.get('state') ?? '';
	if (!pending || !state || !sameString(state, pending.state)) {
		return failed(
			ctx,
			'This sign-in was not started here, or took too long. Close this window and try again.'
		);
	}
	// The answer has to come from the server the person was sent to (RFC 9207).
	const iss = query.get('iss');
	if (iss !== null && iss !== pending.issuer) {
		return failed(
			ctx,
			'The answer came from an unexpected server. Close this window and try again.'
		);
	}
	if (query.get('error')) {
		return query.get('error') === 'access_denied'
			? popupPage(ctx, 'Sign-in cancelled', 'You can close this window.')
			: failed(ctx, 'The sign-in was refused. Close this window and try again.');
	}
	const code = query.get('code');
	if (!code) return failed(ctx, 'The sign-in did not complete. Close this window and try again.');

	let tokens: { access_token?: string; refresh_token?: string; scope?: string };
	let metadata: ServerMetadata;
	try {
		metadata = await serverMetadata(ctx, pending.issuer);
		const response = await event.fetch(metadata.token_endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri(ctx),
				client_id: pending.clientId,
				code_verifier: pending.verifier,
				resource: mountUrl(ctx)
			}).toString()
		});
		if (!response.ok) throw new Error(`token endpoint answered ${response.status}`);
		tokens = await response.json();
		if (!tokens.access_token) throw new Error('token endpoint returned no access token');
	} catch (error) {
		console.error('[cms oauth] code exchange failed', error);
		return failed(ctx, 'The sign-in could not be completed. Close this window and try again.', 502);
	}

	const user = await oauth.identify(
		{ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, scope: tokens.scope },
		mountUrl(ctx),
		ctx.authCtx
	);

	// The token has said who this is and has no further use: the session is
	// the CMS's own. Giving it back keeps the person's list of connected apps
	// from growing by one with every sign-in. Best effort.
	if (metadata.revocation_endpoint) {
		void event
			.fetch(metadata.revocation_endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					token: tokens.refresh_token ?? tokens.access_token,
					client_id: pending.clientId
				}).toString()
			})
			.catch(() => {});
	}

	if (!user) return failed(ctx, 'That account could not be used to sign in.', 403);
	if (!(await ctx.auth.authorize(user, ctx.projectId, ctx.authCtx))) {
		return failed(
			ctx,
			`${user.email || user.name} can't edit this site. Close this window and sign in with an account that can.`,
			403
		);
	}

	const handoff = await oauth.createSession(user, ctx.authCtx, { ttlMs: HANDOFF_TTL_MS });
	return html(
		page(
			'Signed in',
			`<h1>Signed in</h1>
<p class="sub" id="message">Finishing…</p>
<script>
	// To the login page that opened this window, and to nothing else: it is
	// on this origin, and the token is useless to anyone a minute from now.
	if (window.opener) {
		window.opener.postMessage(
			{ type: 'velastack-cms-oauth', handoff: ${JSON.stringify(handoff.token)} },
			window.location.origin
		);
		window.close();
	}
	document.getElementById('message').textContent = window.opener
		? 'You can close this window.'
		: 'Go back to your site and choose Sign in again.';
</script>`
		),
		ctx,
		200,
		"'none'"
	);
};

/**
 * The hand-off the login page posts: the editor it stands for, with a
 * session of full length, or `null` when it was already used or has expired.
 */
export const redeemHandoff = async (ctx: RouteCtx, handoff: string) => {
	const oauth = ctx.auth.oauth;
	if (!oauth) return null;
	const user = await oauth.redeem(handoff, ctx.authCtx);
	if (!user) return null;
	// Asked again: a minute is long enough for access to be taken away.
	if (!(await ctx.auth.authorize(user, ctx.projectId, ctx.authCtx))) return null;
	return oauth.createSession(user, ctx.authCtx);
};
