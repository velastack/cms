/**
 * Path dispatch for the catch-all mount.
 *
 * Every endpoint arrives at one `+server.ts` as a rest parameter, so the route
 * table lives here rather than in the filesystem. That is the whole point of
 * the design: adding or changing an endpoint is a package release, and the
 * application's mount file never changes.
 */
import type { RequestEvent } from '@sveltejs/kit';
import type { RouteCtx, RouteHandler } from './routes/context.js';

/**
 * `public`   — anonymous callers are served (published content only).
 * `required` — no editor is a 403.
 * `exempt`   — skips the cross-project check, so an editor holding a session
 *              for one project can still reach another's login form and log
 *              out. Reproduces `isAuthEndpoint` from the hook this replaces.
 */
export type RouteAuth = 'public' | 'required' | 'exempt';

export type Route = {
	method: 'GET' | 'POST' | 'DELETE';
	/** Path segments; a leading `:` captures. */
	segments: string[];
	auth: RouteAuth;
	handler: RouteHandler;
};

export type RouteMatch = {
	route: Route;
	params: Record<string, string>;
};

export type RouteLookup =
	| { kind: 'match'; match: RouteMatch }
	| { kind: 'method-not-allowed'; allowed: string[] }
	| { kind: 'not-found' };

const segmentsMatch = (pattern: string[], actual: string[]): Record<string, string> | null => {
	if (pattern.length !== actual.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < pattern.length; i++) {
		const p = pattern[i];
		if (p.startsWith(':')) {
			if (actual[i] === '') return null;
			params[p.slice(1)] = decodeURIComponent(actual[i]);
		} else if (p !== actual[i]) {
			return null;
		}
	}
	return params;
};

/** Split a rest-parameter value into path segments. */
export const splitPath = (path: string): string[] => path.split('/').filter(Boolean);

/**
 * Resolve a method + path against the table.
 *
 * A path that matches some route but not this method is a 405 with `Allow`,
 * not a 404 — the distinction matters for anyone debugging a mount.
 */
export const lookupRoute = (routes: Route[], method: string, segments: string[]): RouteLookup => {
	const byPath: Array<{ route: Route; params: Record<string, string> }> = [];
	for (const route of routes) {
		const params = segmentsMatch(route.segments, segments);
		if (params) byPath.push({ route, params });
	}
	if (byPath.length === 0) return { kind: 'not-found' };

	// A literal segment beats a capture, so `/media` never shadows `/media/:id`
	// and vice versa.
	const specificity = (r: Route) => r.segments.filter((s) => !s.startsWith(':')).length;
	byPath.sort((a, b) => specificity(b.route) - specificity(a.route));

	const hit = byPath.find((c) => c.route.method === method);
	if (hit) return { kind: 'match', match: { route: hit.route, params: hit.params } };

	const methods: string[] = [...new Set(byPath.map((c) => c.route.method))];
	if (methods.includes('GET')) methods.push('HEAD');
	methods.push('OPTIONS');
	return { kind: 'method-not-allowed', allowed: methods };
};

export const methodNotAllowed = (allowed: string[]): Response =>
	new Response(`Method not allowed. Allowed: ${allowed.join(', ')}`, {
		status: 405,
		headers: { allow: allowed.join(', '), 'content-type': 'text/plain; charset=utf-8' }
	});

export const notFound = (): Response =>
	new Response('Not found', {
		status: 404,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});

export type { RouteCtx, RouteHandler };

/** Narrow a raw method string, mapping HEAD onto GET as SvelteKit does. */
export const normalizeMethod = (event: RequestEvent): string =>
	event.request.method === 'HEAD' ? 'GET' : event.request.method;
