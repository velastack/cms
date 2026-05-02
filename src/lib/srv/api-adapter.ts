import type {
	CmsAdapter,
	CmsAdapterContext,
	CmsAdapterDoc,
	CmsEntry,
	CmsScopeQuery
} from './types.ts';

export type ApiAdapterOptions = {
	/**
	 * Base URL of the CMS backend, e.g.
	 * `'http://localhost:5174/v1/projects/project_id/cms'`. Trailing slash is
	 * stripped.
	 */
	endpoint: string;
};

/**
 * HTTP-backed adapter that talks to a remote @velastack/cms backend.
 *
 * Mirrors the in-memory mock's wire shape (one GET `/docs` per scope query;
 * GET `/pages` for entry enumeration) so the same backend powers both the
 * in-process mock and this adapter while the migration is in flight. Forwards
 * `previewKey` as `?preview=…` so the backend overlays pending release edits
 * when present. Uses the request-scoped `context.fetch` so SvelteKit can
 * forward cookies during SSR.
 */
export const apiAdapter = (options: ApiAdapterOptions): CmsAdapter => {
	const endpoint = options.endpoint.replace(/\/$/, '');

	return {
		endpoint,

		async fetchDocs(
			queries: CmsScopeQuery[],
			context: CmsAdapterContext
		): Promise<Record<string, CmsAdapterDoc>> {
			const out: Record<string, CmsAdapterDoc> = {};
			const extraSuffix = context.versionKey
				? `&version=${encodeURIComponent(context.versionKey)}`
				: context.previewKey
					? `&preview=${encodeURIComponent(context.previewKey)}`
					: '';
			await Promise.all(
				queries.map(async (q) => {
					const qs = new URLSearchParams({
						kind: q.kind,
						routeId: q.routeId,
						params: JSON.stringify(q.params)
					}).toString();
					const res = await context.fetch(`${endpoint}/docs?${qs}${extraSuffix}`, {
						credentials: 'include'
					});
					if (res.status === 404) return;
					if (!res.ok) {
						throw new Error(`apiAdapter.fetchDocs ${q.scopeId}: ${res.status}`);
					}
					const body = (await res.json()) as { contents: Record<string, unknown> };
					out[q.scopeId] = { contents: body.contents };
				})
			);
			return out;
		},

		async fetchEntries(routeId: string, context: CmsAdapterContext): Promise<CmsEntry[]> {
			// Without `previewKey`: `/pages` is read-public; the backend returns
			// published entries only when no `cms_session` cookie is present.
			// For prerender we don't pass a cookie — we get published-only by
			// construction. We still filter `isDraft` / `isDeletePending` as a
			// defensive belt-and-suspenders.
			//
			// With `previewKey`: forward as `?preview=…` so the backend overlays
			// the matching open release, and skip the filter so the editor sees
			// staged additions/deletions.
			//
			// With `versionKey`: forward as `?version=…`; the backend returns
			// the entry list as it was at that release's publish time. No drafts,
			// no pending deletes — past releases are immutable.
			const querySuffix = context.versionKey
				? `?version=${encodeURIComponent(context.versionKey)}`
				: context.previewKey
					? `?preview=${encodeURIComponent(context.previewKey)}`
					: '';
			const res = await context.fetch(`${endpoint}/pages${querySuffix}`, {
				credentials: 'include'
			});
			if (!res.ok) throw new Error(`apiAdapter.fetchEntries: ${res.status}`);
			const body = (await res.json()) as {
				routes: Array<{
					routeId: string;
					entries: Array<{
						params: Record<string, string>;
						isDraft?: boolean;
						isDeletePending?: boolean;
						metadata?: Record<string, unknown>;
					}>;
				}>;
			};
			const route = body.routes.find((r) => r.routeId === routeId);
			if (!route) return [];
			const entries =
				context.versionKey || context.previewKey
					? route.entries
					: route.entries.filter((e) => !e.isDraft && !e.isDeletePending);
			return entries.map((e) => ({ params: e.params, metadata: e.metadata ?? {} }));
		}
	};
};
