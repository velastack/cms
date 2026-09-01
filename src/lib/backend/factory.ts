/**
 * `createCmsBackend` — everything the HTTP layer needs, bound to one database.
 *
 * The whole point of this shape is that the application's mount file is three
 * lines and never changes: the route table, the auth pipeline, CORS, and the
 * cache contract all live in the package, so a fix ships as an npm update
 * rather than a re-vendoring.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { createStore, type CmsStore } from './store/queries.js';
import { createReadCache, type ReadCache } from './store/cache.js';
import { openDatabase } from './store/db.js';
import { runMigrations } from './store/migrate.js';
import { MIGRATIONS } from './store/migrations/index.js';
import type { SqliteDb } from './store/sqlite.js';
import { createResponders } from './http.js';
import { createStorage } from './storage.js';
import { serveUploadBytes } from './routes/media.js';
import { createEditorStore, type CmsEditorStore } from './auth/editors.js';
import { localEditors } from './auth/local-editors.js';
import { lookupRoute, methodNotAllowed, normalizeMethod, notFound, splitPath } from './router.js';
import { ROUTES } from './routes/table.js';
import type { RouteCtx } from './routes/context.js';
import { clearUploads, normalizeSeed, type SeedInput } from './routes/test-reset.js';
import type { CmsAuthContext, CmsBackendOptions, CmsEditor } from './types.js';

/** `vela` sets `VELA_DATA_DIR` wherever it runs an app; the fallback covers a
 * bare `vitest` or a script run by hand, where the project root is right. */
const defaultDataDir = (): string =>
	process.env.VELA_DATA_DIR ?? resolvePath(process.cwd(), 'data');

export type CmsBackend = {
	/** Drop into a catch-all `+server.ts` as `export const fallback`. */
	handler: RequestHandler;
	/** For a host-level `/uploads/[filename]` route. Reads `params.filename`. */
	serveUpload: RequestHandler;
	/** Same as `handler`, for callers holding a `RequestEvent` directly. */
	handle: (event: RequestEvent) => Promise<Response>;
	editors: CmsEditorStore;
	store: CmsStore;
	db: SqliteDb;
	cache: ReadCache;
	/** Test-only. Throws unless `testReset` is enabled. */
	testing: { reset: (projectId: string, seed?: SeedInput) => Promise<void> };
	close: () => void;
};

export const createCmsBackend = (options: CmsBackendOptions = {}): CmsBackend => {
	const dbPath = options.dbPath ?? join(defaultDataDir(), 'cms.sqlite');
	const db = options.db ?? openDatabase(dbPath);
	// An injected connection may not have been migrated yet.
	if (options.db) runMigrations(db, MIGRATIONS);

	const uploadDir =
		options.uploadDir ??
		(dbPath === ':memory:' ? join(defaultDataDir(), 'uploads') : join(dirname(dbPath), 'uploads'));

	const store = createStore(db);
	const cache = createReadCache();
	const respond = createResponders(store, cache);
	const storage = createStorage(uploadDir);
	const editors = createEditorStore(db);
	const auth = options.auth ?? localEditors();

	const restParam = options.restParam ?? 'path';
	const cookieName = options.cookie?.name ?? 'cms_session';
	const resolveProject = options.resolveProject ?? (() => 'default');
	const frameAncestors = options.frameAncestors ?? "'self'";
	const cors = options.cors ?? false;
	const testReset = options.testReset ?? false;

	/**
	 * The path the backend is mounted at: the request path with the matched rest
	 * segments trimmed off the end. Derived per request so the same code works
	 * at `/cms` and `/v1/projects/x/cms` with no configuration.
	 */
	const mountPathFor = (event: RequestEvent, restPath: string): string => {
		const pathname = event.url.pathname.replace(/\/$/, '');
		if (!restPath) return pathname;
		const suffix = `/${restPath}`;
		return pathname.endsWith(suffix) ? pathname.slice(0, -suffix.length) : pathname;
	};

	const mediaUrlFor = (event: RequestEvent, mountPath: string) => {
		const base = options.mediaBaseUrl;
		const resolved =
			typeof base === 'function'
				? base(event)
				: (base ?? `${new URL(mountPath, event.url).origin}/uploads`);
		const trimmed = resolved.replace(/\/$/, '');
		return (filename: string) => `${trimmed}/${filename}`;
	};

	/**
	 * Cookie attributes. `sameSite: 'none'` is required for the cross-origin
	 * iframe login and wrong for a same-origin mount on plain http, so the
	 * default follows whether CORS is configured rather than being hardcoded
	 * one way.
	 */
	const cookieOptionsFor = (event: RequestEvent) => {
		const crossOrigin = cors !== false;
		const isHttps = event.url.protocol === 'https:';
		return {
			path: options.cookie?.path ?? '/',
			httpOnly: true,
			sameSite: options.cookie?.sameSite ?? (crossOrigin ? ('none' as const) : ('lax' as const)),
			secure: options.cookie?.secure ?? (crossOrigin ? true : isHttps),
			...(options.cookie?.partitioned ? { partitioned: true } : {}),
			maxAge: options.cookie?.maxAge ?? 60 * 60 * 24 * 30
		};
	};

	const applyCors = (event: RequestEvent, response: Response): Response => {
		if (cors === false) return response;
		// Appended, not set, and always — a cached response must not be reused
		// for a different origin.
		response.headers.append('vary', 'Origin');
		const origin = event.request.headers.get('origin');
		if (origin && cors.origin(origin, event)) {
			response.headers.set('access-control-allow-origin', origin);
			if (cors.credentials !== false) {
				response.headers.set('access-control-allow-credentials', 'true');
			}
		}
		return response;
	};

	const preflight = (event: RequestEvent): Response => {
		if (cors === false) return new Response(null, { status: 204 });
		const headers = new Headers({
			'access-control-allow-methods': (cors.methods ?? ['GET', 'POST', 'DELETE', 'OPTIONS']).join(
				','
			),
			'access-control-allow-headers': (cors.headers ?? ['content-type', 'authorization']).join(', ')
		});
		const response = new Response(null, { status: 204, headers });
		return applyCors(event, response);
	};

	const handle = async (event: RequestEvent): Promise<Response> => {
		const restPath = (event.params as Record<string, string | undefined>)[restParam] ?? '';
		const segments = splitPath(restPath);
		const method = normalizeMethod(event);

		// Preflight is answered before auth and before any database access.
		if (method === 'OPTIONS') return preflight(event);

		const lookup = lookupRoute(ROUTES, method, segments);
		if (lookup.kind === 'not-found') return applyCors(event, notFound());
		if (lookup.kind === 'method-not-allowed') {
			return applyCors(event, methodNotAllowed(lookup.allowed));
		}
		const { route, params } = lookup.match;

		if (route.handler === undefined) return applyCors(event, notFound());
		if (route.segments[0] === '__test_reset__' && !testReset) {
			return applyCors(event, notFound());
		}

		const projectId = resolveProject(event);
		if (projectId === null) return applyCors(event, notFound());

		const authCtx: CmsAuthContext = { db, projectId, cookieName };

		// Resolve, then authorize, then dispatch. Both checks happen before any
		// handler body runs, which is what keeps a cross-project write from
		// touching the database at all.
		let user: CmsEditor | null = null;
		try {
			user = await auth.resolve(event, authCtx);
		} catch {
			user = null;
		}
		if (user && route.auth !== 'exempt' && !(await auth.authorize(user, projectId, authCtx))) {
			return applyCors(event, new Response(null, { status: 403 }));
		}
		if (route.auth === 'required' && !user) {
			return applyCors(event, new Response(null, { status: 403 }));
		}

		const mountPath = mountPathFor(event, restPath);
		const ctx: RouteCtx = {
			event,
			projectId,
			user,
			params,
			store,
			cache,
			respond,
			storage,
			auth,
			authCtx,
			mediaUrl: mediaUrlFor(event, mountPath),
			mountPath,
			frameAncestors,
			setSessionCookie: (token, expiresAt) => {
				const opts = cookieOptionsFor(event);
				event.cookies.set(cookieName, token, {
					...opts,
					maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
				});
			},
			clearSessionCookie: () => {
				event.cookies.set(cookieName, '', { ...cookieOptionsFor(event), maxAge: 0 });
			}
		};

		return applyCors(event, await route.handler(ctx));
	};

	const handler: RequestHandler = (event) => handle(event);

	const serveUpload: RequestHandler = (event) =>
		serveUploadBytes(storage, (event.params as Record<string, string | undefined>).filename);

	return {
		handler,
		serveUpload,
		handle,
		editors,
		store,
		db,
		cache,
		testing: {
			reset: async (projectId, seed = {}) => {
				if (!testReset) {
					throw new Error('createCmsBackend({ testReset: true }) is required to call reset()');
				}
				store.__resetProjectForTests(projectId);
				cache.clear();
				await clearUploads(uploadDir);
				const { layouts, pages } = normalizeSeed(seed);
				if (Object.keys(layouts).length > 0 || Object.keys(pages).length > 0) {
					store.seedPublishedDocs(projectId, layouts, pages);
				}
			}
		},
		close: () => db.close()
	};
};
