import { building } from '$app/environment';
import { buildConfig } from 'virtual:vela-cms/build-config';
import type {
	CmsAdapter,
	CmsAdapterContext,
	CmsAdapterResolution,
	CmsEntry,
	CmsScopeQuery
} from './types.ts';

export type ApiAdapterOptions = {
	/**
	 * Base URL of the CMS backend, e.g.
	 * `'https://velastack.dev/v1/projects/velastack-cms/cms'`. Trailing slash is
	 * stripped.
	 */
	endpoint: string;
};

type BuildMediaConfig = { uploadsBase: string | null; mediaPrefix: string };

/**
 * The Vite plugin generates `virtual:vela-cms/build-config` with the
 * project's resolved `{ uploadsBase, mediaPrefix }` (or `null` when the
 * customer hasn't passed `cms({ endpoint })`). Inlining the value via a
 * virtual module is the only way it survives into SvelteKit's prerender
 * worker thread, which doesn't share `globalThis` with the plugin process.
 */
const getBuildMediaConfig = (): BuildMediaConfig | null => {
	if (!building) return null;
	return buildConfig.media;
};

const RELATIVE_UPLOADS_RE = /^\/uploads\/([^/?#]+)$/;

/**
 * Deep-clone `value` and replace every `/uploads/<file>` (relative) and
 * `<uploadsBase>/<file>` (absolute) string with `<mediaPrefix>/<file>`. Pure;
 * cycle-safe via a WeakMap. Mirrors the helper in `plugin/src/media.ts` —
 * deliberately duplicated to keep the runtime adapter free of plugin imports.
 */
const rewriteMediaUrls = <T>(value: T, uploadsBase: string | null, mediaPrefix: string): T => {
	const seen = new WeakMap<object, unknown>();
	const prefix = uploadsBase === null ? null : `${uploadsBase}/`;
	const normalizedPrefix = mediaPrefix.replace(/\/$/, '');
	const walk = (v: unknown): unknown => {
		if (typeof v === 'string') {
			const m = RELATIVE_UPLOADS_RE.exec(v);
			if (m) return `${normalizedPrefix}/${m[1]}`;
			if (prefix !== null && v.startsWith(prefix)) {
				const rest = v.slice(prefix.length).split(/[?#]/)[0];
				if (rest && !rest.includes('/')) return `${normalizedPrefix}/${rest}`;
			}
			return v;
		}
		if (!v || typeof v !== 'object') return v;
		const cached = seen.get(v as object);
		if (cached !== undefined) return cached;
		if (Array.isArray(v)) {
			const arr: unknown[] = [];
			seen.set(v as object, arr);
			for (const x of v) arr.push(walk(x));
			return arr;
		}
		const obj: Record<string, unknown> = {};
		seen.set(v as object, obj);
		for (const k of Object.keys(v as Record<string, unknown>)) {
			obj[k] = walk((v as Record<string, unknown>)[k]);
		}
		return obj;
	};
	return walk(value) as T;
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
		): Promise<Record<string, CmsAdapterResolution>> {
			const out: Record<string, CmsAdapterResolution> = {};
			const mediaConfig = getBuildMediaConfig();
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
						params: JSON.stringify(q.params),
						locale: q.locale
					}).toString();
					const res = await context.fetch(`${endpoint}/docs?${qs}${extraSuffix}`, {
						credentials: 'include'
					});
					if (res.status === 404) return;
					if (!res.ok) {
						throw new Error(`apiAdapter.fetchDocs ${q.scopeId}: ${res.status}`);
					}
					const body = (await res.json()) as
						| { contents: Record<string, unknown> }
						| { kind: 'gone' }
						| { kind: 'redirect'; to: string };
					if ('kind' in body) {
						out[q.scopeId] = body;
					} else {
						const contents = mediaConfig
							? rewriteMediaUrls(body.contents, mediaConfig.uploadsBase, mediaConfig.mediaPrefix)
							: body.contents;
						out[q.scopeId] = { contents };
					}
				})
			);
			return out;
		},

		async fetchSite(context: CmsAdapterContext): Promise<Record<string, unknown>> {
			const qs = new URLSearchParams();
			if (context.versionKey) qs.set('version', context.versionKey);
			else if (context.previewKey) qs.set('preview', context.previewKey);
			const suffix = qs.toString() ? `?${qs}` : '';
			const res = await context.fetch(`${endpoint}/site${suffix}`, {
				credentials: 'include'
			});
			if (res.status === 404) return {};
			if (!res.ok) throw new Error(`apiAdapter.fetchSite: ${res.status}`);
			const body = (await res.json()) as { contents: Record<string, unknown> };
			const mediaConfig = getBuildMediaConfig();
			const contents = mediaConfig
				? rewriteMediaUrls(body.contents, mediaConfig.uploadsBase, mediaConfig.mediaPrefix)
				: body.contents;
			return contents ?? {};
		},

		async fetchEntries(routeId: string, context: CmsAdapterContext): Promise<CmsEntry[]> {
			// Without `previewKey`: `/pages` is read-public; the backend returns
			// published entries only when no `cms_session` cookie is present.
			// For prerender we don't pass a cookie — we get published-only by
			// construction. We still filter `isDraft` / `isDeletePending` /
			// `gone` as a defensive belt-and-suspenders. Tombstoned entries
			// with `redirectTo` are kept so prerender visits the URL and
			// SvelteKit emits the redirect file.
			//
			// With `previewKey`: forward as `?preview=…` so the backend overlays
			// the matching open release, and skip the filter so the editor sees
			// staged additions/deletions.
			//
			// With `versionKey`: forward as `?version=…`; the backend returns
			// the entry list as it was at that release's publish time. No drafts,
			// no pending deletes — past releases are immutable.
			const qs = new URLSearchParams({ locale: context.locale });
			if (context.versionKey) qs.set('version', context.versionKey);
			else if (context.previewKey) qs.set('preview', context.previewKey);
			const res = await context.fetch(`${endpoint}/pages?${qs}`, {
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
						redirectTo?: string;
						gone?: boolean;
						metadata?: Record<string, unknown>;
					}>;
				}>;
			};
			const route = body.routes.find((r) => r.routeId === routeId);
			if (!route) return [];
			const entries =
				context.versionKey || context.previewKey
					? route.entries
					: route.entries.filter((e) => !e.isDraft && !e.isDeletePending && !e.gone);
			const mediaConfig = getBuildMediaConfig();
			return entries.map((e) => {
				const metadata = e.metadata ?? {};
				const rewritten = mediaConfig
					? rewriteMediaUrls(metadata, mediaConfig.uploadsBase, mediaConfig.mediaPrefix)
					: metadata;
				return {
					params: e.params,
					metadata: rewritten,
					...(e.redirectTo ? { redirectTo: e.redirectTo } : {}),
					...(e.gone ? { gone: true as const } : {})
				};
			});
		}
	};
};
