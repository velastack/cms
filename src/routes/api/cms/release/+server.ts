import type { RequestHandler } from '@sveltejs/kit';
import { getOpenRelease } from '../_store.js';

// MOCK ONLY — cookie value doubles as the userId.
export const GET: RequestHandler = async ({ cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });
	const release = getOpenRelease(userId);
	if (!release) return Response.json({ release: null });
	return Response.json({ release });
};
