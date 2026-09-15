/**
 * `GET /deploy` and `POST /deploy` — the host's build pipeline, behind the
 * `deploy` adapter. With no adapter the GET reports `available: false` and the
 * POST is a 404, so a same-origin mount never shows the action.
 */
import type { CmsDeployContext, CmsDeployState } from '../types.js';
import { requireUser, type RouteCtx } from './context.js';

/** Thrown by an adapter to map a failure to a status: 409 while a run is in
 * flight, 503 when the project has no pipeline to deploy through. */
export class CmsDeployError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'CmsDeployError';
	}
}

const deployContext = (ctx: RouteCtx): CmsDeployContext => ({
	event: ctx.event,
	projectId: ctx.projectId,
	user: requireUser(ctx),
	store: ctx.store
});

/** Adapter errors carry their own status; anything else is a bare 500 so a
 * host bug never reaches the bar as an HTML error page it would try to parse. */
const respond = async (run: () => Promise<CmsDeployState>, status: number): Promise<Response> => {
	try {
		return Response.json(await run(), { status });
	} catch (err) {
		if (err instanceof CmsDeployError) {
			return new Response(err.message, {
				status: err.status,
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			});
		}
		return new Response(null, { status: 500 });
	}
};

export const getDeploy = (ctx: RouteCtx): Promise<Response> => {
	const { deploy } = ctx;
	if (!deploy) {
		return Promise.resolve(Response.json({ available: false } satisfies CmsDeployState));
	}
	return respond(() => deploy.status(deployContext(ctx)), 200);
};

export const postDeploy = (ctx: RouteCtx): Promise<Response> => {
	const { deploy } = ctx;
	if (!deploy) return Promise.resolve(new Response(null, { status: 404 }));
	return respond(() => deploy.trigger(deployContext(ctx)), 202);
};
