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
 */
import type { RouteCtx } from './context.js';

const escapeHtml = (s: string): string =>
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
@media (prefers-color-scheme: dark) {
	body { background: #0a0a0a; color: #fafafa; }
	.card { background: #0a0a0a; border-color: #262626; }
	input { background: #0a0a0a; border-color: #404040; }
	input:focus-visible { outline-color: #fafafa; }
	button { background: #fafafa; color: #0a0a0a; }
	button:hover { background: #e5e5e5; }
	p.sub { color: #a3a3a3; }
	.error { background: #2a1215; color: #fca5a5; }
}
`;

const page = (title: string, body: string): string =>
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

const loginForm = (error?: string): string =>
	page(
		'Sign in to edit',
		`<h1>Sign in to edit</h1>
<p class="sub">Use your email and password</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="POST">
	<div class="field">
		<label for="email">Email</label>
		<input id="email" name="email" type="email" autocomplete="email" required autofocus>
	</div>
	<div class="field">
		<label for="password">Password</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required>
	</div>
	<button type="submit">Sign in</button>
</form>`
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

const html = (body: string, ctx: RouteCtx, status = 200): Response =>
	new Response(body, {
		status,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			// The bar embeds this cross-origin, so the host decides who may frame it.
			'content-security-policy': `frame-ancestors ${ctx.frameAncestors}`,
			'cache-control': 'no-store'
		}
	});

export const getLogin = (ctx: RouteCtx): Response => {
	if (!ctx.auth.login) return new Response(null, { status: 404 });
	// Already signed in and authorized for this project — skip straight to the
	// success screen. A session bound to a project the caller can't reach leaves
	// `user` null, so they land on the form and can sign in as someone else.
	if (ctx.user) return html(successPage(), ctx);
	return html(loginForm(), ctx);
};

export const postLogin = async (ctx: RouteCtx): Promise<Response> => {
	if (!ctx.auth.login) return new Response(null, { status: 404 });

	let form: FormData;
	try {
		form = await ctx.event.request.formData();
	} catch {
		return html(loginForm('Could not read the submitted form.'), ctx, 400);
	}

	const email = form.get('email');
	const password = form.get('password');
	if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
		return html(loginForm('Enter both an email and a password.'), ctx, 400);
	}

	const grant = await ctx.auth.login(email, password, ctx.authCtx);
	// One message either way — which half was wrong is not the caller's business.
	if (!grant) return html(loginForm('Invalid email or password.'), ctx, 400);

	ctx.setSessionCookie(grant.token, grant.expiresAt);
	return html(successPage(), ctx);
};

/** Kept so the admin bar's historical `/iframe/login/success` URL still
 * resolves; the POST above renders the same screen inline. */
export const getLoginSuccess = (ctx: RouteCtx): Response => {
	if (!ctx.user) {
		return new Response(null, {
			status: 303,
			headers: { location: `${ctx.mountPath}/iframe/login` }
		});
	}
	return html(successPage(), ctx);
};
