import type { RequestHandler } from '@sveltejs/kit';
import { revertRelease } from '../../../../_store.js';

// MOCK ONLY — cookie value doubles as the userId.
export const POST: RequestHandler = async ({ params, cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });
	const id = params.id;
	if (!id) return new Response('id required', { status: 400 });
	const reverted = revertRelease(id, userId);
	if (!reverted) return new Response('release not found', { status: 404 });
	return Response.json({ release: reverted });
};
