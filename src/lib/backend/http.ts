import type { ReadCache } from './store/cache.js';
import type { CmsStore } from './store/queries.js';

/**
 * Cache-Control for public CMS reads. Short browser TTL keeps editors close
 * to fresh after publish; `stale-while-revalidate` smooths cache misses; the
 * larger `s-maxage` lets a CDN hold the cached copy longer than browsers do.
 */
const PUBLIC_CC = 'public, max-age=10, stale-while-revalidate=300, s-maxage=300';

/** `?version=<key>` reads are bound to a published release id and never
 * change — safe to cache forever. */
const IMMUTABLE_CC = 'public, max-age=31536000, immutable';

const JSON_TYPE = 'application/json; charset=utf-8';

type CacheEvent = {
	request: Request;
	setHeaders: (headers: Record<string, string>) => void;
};

export type PublicCachePass = {
	hit: false;
	version: number;
	etag: string;
};

type PublicCacheHit = {
	hit: true;
	response: Response;
};

/**
 * Bind the cache-aware responders to one store and one read cache.
 *
 * The bodies are a verbatim move: the header values, the ETag basis, the
 * positive-only caching, and the branch order are the contract the shipped
 * client already depends on, so none of it is re-derived here.
 *
 * Note these take a duck-typed `{ request, setHeaders }` rather than a full
 * `RequestEvent`, which is what lets the tests drive them directly.
 */
export const createResponders = (store: CmsStore, cache: ReadCache) => {
	/**
	 * Check the LRU and `If-None-Match` for a public read. On hit/304 returns a
	 * ready Response. On miss returns `{ hit: false, version, etag }` so the
	 * caller can pass them back into `servePublicJson` / `servePublicNotFound`
	 * without re-reading `cms_version` (avoiding a publish-races-read TOCTOU).
	 */
	const tryPublicCache = (
		event: CacheEvent,
		projectId: string,
		scope: string
	): PublicCacheHit | PublicCachePass => {
		const version = store.getCmsVersion(projectId);
		const etag = `"${version}"`;
		const ifNoneMatch = event.request.headers.get('if-none-match');

		if (ifNoneMatch === etag) {
			event.setHeaders({ 'cache-control': PUBLIC_CC, etag });
			return { hit: true, response: new Response(null, { status: 304 }) };
		}

		const cached = cache.get({ projectId, cmsVersion: version, scope });
		if (cached !== undefined) {
			event.setHeaders({ 'cache-control': PUBLIC_CC, etag, 'content-type': JSON_TYPE });
			return { hit: true, response: new Response(cached, { status: 200 }) };
		}

		return { hit: false, version, etag };
	};

	/** Serve and LRU-cache a 200 JSON response for a public read. */
	const servePublicJson = (
		event: CacheEvent,
		projectId: string,
		scope: string,
		pass: PublicCachePass,
		payload: unknown
	): Response => {
		const body = JSON.stringify(payload);
		cache.set({ projectId, cmsVersion: pass.version, scope }, body);
		event.setHeaders({
			'cache-control': PUBLIC_CC,
			etag: pass.etag,
			'content-type': JSON_TYPE
		});
		return new Response(body, { status: 200 });
	};

	/**
	 * Serve a 404 for a public read. We set Cache-Control + ETag so the CDN /
	 * browser can negative-cache briefly, but do NOT populate the LRU — the cache
	 * is positive-only so empty-tenant flooding can't poison it.
	 */
	const servePublicNotFound = (event: CacheEvent, pass: PublicCachePass): Response => {
		event.setHeaders({ 'cache-control': PUBLIC_CC, etag: pass.etag });
		return new Response(null, { status: 404 });
	};

	/** Serve a JSON 200 for `?version=<key>` — immutable per release. */
	const serveImmutableJson = (event: CacheEvent, payload: unknown): Response => {
		event.setHeaders({ 'cache-control': IMMUTABLE_CC, 'content-type': JSON_TYPE });
		return new Response(JSON.stringify(payload), { status: 200 });
	};

	const serveImmutableNotFound = (event: CacheEvent): Response => {
		event.setHeaders({ 'cache-control': IMMUTABLE_CC });
		return new Response(null, { status: 404 });
	};

	return {
		tryPublicCache,
		servePublicJson,
		servePublicNotFound,
		serveImmutableJson,
		serveImmutableNotFound
	};
};

export type CmsResponders = ReturnType<typeof createResponders>;
