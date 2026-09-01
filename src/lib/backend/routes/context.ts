/**
 * What every route handler receives.
 *
 * Handlers used to read `event.locals.cmsUser` and `event.params.project_id`,
 * both of which are conventions of one particular application. Passing them
 * explicitly is what makes the same handler work at `/cms` and at
 * `/v1/projects/[project_id]/cms` without knowing which it is.
 */
import type { RequestEvent } from '@sveltejs/kit';
import type { CmsStore } from '../store/queries.js';
import type { ReadCache } from '../store/cache.js';
import type { CmsResponders } from '../http.js';
import type { CmsStorage } from '../storage.js';
import type { CmsAuthAdapter, CmsAuthContext, CmsEditor } from '../types.js';

export type RouteCtx = {
	event: RequestEvent;
	/** The tenant this request is for. `'default'` in a single-tenant mount. */
	projectId: string;
	/** The signed-in editor, or `null`. Routes declared `required` never see null. */
	user: CmsEditor | null;
	/** Captured `:name` segments from the route pattern. */
	params: Record<string, string>;
	store: CmsStore;
	cache: ReadCache;
	respond: CmsResponders;
	storage: CmsStorage;
	auth: CmsAuthAdapter;
	authCtx: CmsAuthContext;
	/** Absolute-or-root-relative URL for an uploaded file, per the host's
	 * configured media base. */
	mediaUrl: (filename: string) => string;
	/** The path the backend is mounted at, without a trailing slash. */
	mountPath: string;
	frameAncestors: string;
	setSessionCookie: (token: string, expiresAt: Date) => void;
	clearSessionCookie: () => void;
};

export type RouteHandler = (ctx: RouteCtx) => Response | Promise<Response>;

/** The signed-in editor, for routes the table declares `required`. */
export const requireUser = (ctx: RouteCtx): CmsEditor => {
	if (!ctx.user) throw new Error('route requires a user but the router allowed an anonymous call');
	return ctx.user;
};

export const badRequest = (message: string): Response =>
	new Response(message, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export const forbidden = (): Response => new Response(null, { status: 403 });

export const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

export const isStringRecord = (v: unknown): v is Record<string, string> => {
	if (!isObjectRecord(v)) return false;
	for (const val of Object.values(v)) {
		if (typeof val !== 'string') return false;
	}
	return true;
};

/** Parse a JSON body, or `undefined` when it is absent or malformed. */
export const readJson = async (event: RequestEvent): Promise<unknown | undefined> => {
	const text = await event.request.text();
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};
