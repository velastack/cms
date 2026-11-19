/**
 * The sign-in flow the admin bar embeds in an iframe.
 *
 * This replaces five files in the original — two `+page.server.ts`, two
 * `+page.svelte`, and a `+layout.server.ts` — plus a zod schema, and drops
 * `sveltekit-superforms`, `zod`, and four shadcn components from the surface an
 * application has to vendor. Serving plain HTML from the handler means the
 * login works identically in an app with any UI kit, or none.
 *
 * The flow: the admin bar opens `<endpoint>/iframe/login` in an iframe, the
 * form posts back to the same URL, and on success the page tells the parent
 * window so the bar can re-fetch `/user` without a reload.
 *
 * Two identities matter here. `ctx.user` is an editor authorized for this
 * project; `ctx.sessionUser` is whoever the cookie resolved to, grant or not.
 * The signed-in screen may only render for `ctx.user`: the bar answers it by
 * fetching `/user`, which is a 403 for anyone else, and a bar told "signed in"
 * and then refused would reopen this page forever. A session that cannot edit
 * this site gets the form instead, with a line saying why, so the editor can
 * sign in as someone who can — without disturbing that other site's session,
 * since the cookie is scoped to this mount.
 */
import type { RouteCtx } from './context.js';
import { oauthLabel, redeemHandoff } from './oauth.js';

export const escapeHtml = (s: string): string =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
	);

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
	margin: 0;
	min-height: 100vh;
	display: grid;
	place-items: center;
	padding: 1rem;
	font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	background: #fff;
	color: #0a0a0a;
}
.card {
	width: 100%;
	max-width: 22rem;
	border: 1px solid #e5e5e5;
	border-radius: 0.75rem;
	padding: 1.5rem;
	background: #fff;
}
h1 { margin: 0 0 0.25rem; font-size: 1.125rem; font-weight: 600; text-align: center; }
p.sub { margin: 0 0 1.25rem; color: #737373; text-align: center; }
label { display: block; font-weight: 500; margin-bottom: 0.375rem; }
input {
	width: 100%;
	padding: 0.5rem 0.75rem;
	border: 1px solid #d4d4d4;
	border-radius: 0.5rem;
	background: #fff;
	color: inherit;
	font: inherit;
}
input:focus-visible { outline: 2px solid #0a0a0a; outline-offset: 1px; border-color: transparent; }
.field { margin-bottom: 1rem; }
button {
	width: 100%;
	padding: 0.5rem 0.75rem;
	border: 0;
	border-radius: 0.5rem;
	background: #0a0a0a;
	color: #fafafa;
	font: inherit;
	font-weight: 500;
	cursor: pointer;
}
button:hover { background: #262626; }
.error {
	margin: 0 0 1rem;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	background: #fef2f2;
	color: #b91c1c;
}
.or { margin: 0.75rem 0; color: #737373; text-align: center; }
.hint {
	margin: 0 0 1rem;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	background: #f5f5f5;
	color: #525252;
}
@media (prefers-color-scheme: dark) {
	body { background: #0a0a0a; color: #fafafa; }
	.card { background: #0a0a0a; border-color: #262626; }
	input { background: #0a0a0a; border-color: #404040; }
	input:focus-visible { outline-color: #fafafa; }
	button { background: #fafafa; color: #0a0a0a; }
	button:hover { background: #e5e5e5; }
	p.sub, .or { color: #a3a3a3; }
	.error { background: #2a1215; color: #fca5a5; }
	.hint { background: #171717; color: #a3a3a3; }
}
`;

export const page = (title: string, body: string): string =>
	`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="card">
${body}
</main>
</body>
</html>`;

/** What the login page offers: the password form, a sign-in button, or both. */
type LoginOptions = {
	/** Whether the adapter takes an email and password. */
	password: boolean;
	/** The sign-in button's text, when the adapter signs in through an
	 * authorization server. */
	oauthLabel: string | null;
	/** Where the button's popup starts. */
	oauthStart: string;
};

const oauthButton = (options: LoginOptions): string =>
	options.oauthLabel
		? `<button type="button" id="oauth">${escapeHtml(options.oauthLabel)}</button>
<form method="POST" id="handoff" hidden><input type="hidden" name="handoff"></form>
<script>
	// The authorization server signs the person in on its own site, so it gets
	// a window of its own. That window hands back a one-time token, which is
	// posted from here so the session cookie is set where the admin bar's
	// requests will carry it.
	var popup = null;
	document.getElementById('oauth').addEventListener('click', function () {
		popup = window.open(${JSON.stringify(options.oauthStart)}, 'velastack-cms-signin', 'popup,width=480,height=720');
	});
	window.addEventListener('message', function (event) {
		if (event.origin !== window.location.origin || !popup || event.source !== popup) return;
		if (!event.data || event.data.type !== 'velastack-cms-oauth') return;
		var form = document.getElementById('handoff');
		form.elements.handoff.value = String(event.data.handoff || '');
		form.submit();
	});
</script>`
		: '';

const passwordForm = (): string => `<form method="POST">
	<div class="field">
		<label for="email">Email</label>
		<input id="email" name="email" type="email" autocomplete="email" required autofocus>
	</div>
	<div class="field">
		<label for="password">Password</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required>
	</div>
	<button type="submit">Sign in</button>
</form>`;

const loginForm = (options: LoginOptions, error?: string, hint?: string): string =>
	page(
		'Sign in to edit',
		`<h1>Sign in to edit</h1>
${options.password ? `<p class="sub">${options.oauthLabel ? 'Choose how to sign in' : 'Use your email and password'}</p>` : '<p class="sub">Sign in with your account</p>'}
${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
${oauthButton(options)}
${options.password && options.oauthLabel ? '<p class="or">or</p>' : ''}
${options.password ? passwordForm() : ''}`
	);

const successPage = (): string =>
	page(
		'Signed in',
		`<h1>Signed in</h1>
<p class="sub">You can close this window.</p>
<script>
	// The admin bar listens for this and re-fetches /user. It checks the
	// origin on receipt, which is why posting to "*" here is safe: the
	// message carries nothing secret.
	window.parent?.postMessage({ type: 'velastack-cms-login-success' }, '*');
</script>`
	);

export const html = (
	body: string,
	ctx: RouteCtx,
	status = 200,
	// The bar embeds the login page cross-origin, so the host decides who may
	// frame it.
	frameAncestors = ctx.frameAncestors
): Response =>
	new Response(body, {
		status,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': `frame-ancestors ${frameAncestors}`,
			'cache-control': 'no-store'
		}
	});

/** Why a signed-in browser is looking at a form: its session cannot edit
 * this site. Nothing when there is no session at all. */
const foreignSessionHint = (ctx: RouteCtx): string | undefined =>
	ctx.sessionUser
		? `Signed in as ${ctx.sessionUser.email}, but that account can't edit this site. Sign in with one that can.`
		: undefined;

const loginOptions = async (ctx: RouteCtx): Promise<LoginOptions> => ({
	password: Boolean(ctx.auth.login),
	oauthLabel: await oauthLabel(ctx),
	oauthStart: `${ctx.mountPath}/oauth/start`
});

const hasLogin = (ctx: RouteCtx) => Boolean(ctx.auth.login || ctx.auth.oauth);

export const getLogin = async (ctx: RouteCtx): Promise<Response> => {
	if (!hasLogin(ctx)) return new Response(null, { status: 404 });
	// Authorized for this project already — straight to the signed-in screen.
	if (ctx.user) return html(successPage(), ctx);
	// Anonymous, or a session with no grant here: the form, never the
	// signed-in screen (see the file header).
	return html(loginForm(await loginOptions(ctx), undefined, foreignSessionHint(ctx)), ctx);
};

export const postLogin = async (ctx: RouteCtx): Promise<Response> => {
	if (!hasLogin(ctx)) return new Response(null, { status: 404 });
	const options = await loginOptions(ctx);

	let form: FormData;
	try {
		form = await ctx.event.request.formData();
	} catch {
		return html(loginForm(options, 'Could not read the submitted form.'), ctx, 400);
	}

	// Signed in through the authorization server: the popup's hand-off.
	const handoff = form.get('handoff');
	if (typeof handoff === 'string' && handoff) {
		const session = await redeemHandoff(ctx, handoff);
		if (!session) {
			return html(loginForm(options, 'That sign-in has expired. Try again.'), ctx, 400);
		}
		ctx.setSessionCookie(session.token, session.expiresAt);
		return html(successPage(), ctx);
	}

	if (!ctx.auth.login) return new Response(null, { status: 404 });

	const email = form.get('email');
	const password = form.get('password');
	if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
		return html(loginForm(options, 'Enter both an email and a password.'), ctx, 400);
	}

	const grant = await ctx.auth.login(email, password, ctx.authCtx);
	// One message either way — which half was wrong is not the caller's business.
	if (!grant) return html(loginForm(options, 'Invalid email or password.'), ctx, 400);

	// Right password, wrong site. The session must not reach the browser: the
	// bar would be told "signed in" and then refused by `/user`.
	if (!(await ctx.auth.authorize(grant.user, ctx.projectId, ctx.authCtx))) {
		await ctx.auth.discard?.(grant, ctx.authCtx);
		return html(
			loginForm(
				options,
				`${grant.user.email} can't edit this site. Sign in with an account that can.`
			),
			ctx,
			403
		);
	}

	ctx.setSessionCookie(grant.token, grant.expiresAt);
	return html(successPage(), ctx);
};

/** Kept so the admin bar's historical `/iframe/login/success` URL still
 * resolves; the POST above renders the same screen inline. `ctx.user` is only
 * set for a session authorized here, so a foreign one is sent to the form. */
export const getLoginSuccess = (ctx: RouteCtx): Response => {
	if (!ctx.user) {
		return new Response(null, {
			status: 303,
			headers: { location: `${ctx.mountPath}/iframe/login` }
		});
	}
	return html(successPage(), ctx);
};
