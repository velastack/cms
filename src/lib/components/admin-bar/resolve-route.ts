/**
 * Resolve a SvelteKit route id + params to a concrete URL path.
 *
 * `/(marketing)/rooms/[slug]` + `{ slug: 'a' }` → `/rooms/a`
 * `/(marketing)`              + `{}`            → `/`
 * `/blog/[...rest]`           + `{ rest: 'a/b' }` → `/blog/a/b`
 *
 * Throws if a non-group, non-param segment references a param that's missing
 * from `params`.
 */
export const resolveRouteUrl = (routeId: string, params: Record<string, string>): string => {
	if (routeId === '/' || routeId === '') return '/';
	const segments = routeId.split('/').filter(Boolean);
	const out: string[] = [];
	for (const seg of segments) {
		if (seg.startsWith('(') && seg.endsWith(')')) continue;
		const m = seg.match(/^\[(\.\.\.)?([^/\]]+)\]$/);
		if (m) {
			const name = m[2];
			const value = params[name];
			if (value == null) {
				throw new Error(`resolveRouteUrl: missing param "${name}" for route "${routeId}"`);
			}
			out.push(value);
			continue;
		}
		out.push(seg);
	}
	return '/' + out.join('/');
};

/**
 * Resolve a SvelteKit route id to a route id with params. Removes any group segments.
 *
 * `/(marketing)/rooms/[slug]` → `/rooms/[slug]`
 * `/(marketing)`              → `/`
 * `/blog/[...rest]`           → `/blog/[...rest]`
 *
 */
export const resolveRouteOnlyParams = (routeId: string): string => {
	const segments = routeId.split('/').filter(Boolean);
	const out: string[] = [];
	for (const seg of segments) {
		if (seg.startsWith('(') && seg.endsWith(')')) continue;
		out.push(seg);
	}
	return '/' + out.join('/');
};
