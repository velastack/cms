/**
 * `GET /user` and `POST /logout`.
 *
 * Resolution and project authorization both happen in the router before a
 * handler runs, so `/user` is a pure read of what it decided.
 */
import { requireUser, type RouteCtx } from './context.js';

export const getUser = (ctx: RouteCtx): Response => {
	const user = requireUser(ctx);
	return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
};

/**
 * Idempotent — safe to call without being signed in. Clears the cookie with
 * the same attributes it was set with, so the browser accepts the expiry, and
 * lets the adapter drop server-side session state.
 */
export const postLogout = async (ctx: RouteCtx): Promise<Response> => {
	await ctx.auth.logout?.(ctx.event, ctx.authCtx);
	ctx.clearSessionCookie();
	return new Response(null, { status: 204 });
};
