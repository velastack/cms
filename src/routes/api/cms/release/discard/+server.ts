import type { RequestHandler } from '@sveltejs/kit';
import { discardOpenRelease } from '../../_store.js';

// MOCK ONLY — cookie value doubles as the userId.
export const POST: RequestHandler = async ({ cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });
	const ok = discardOpenRelease(userId);
	return Response.json({ ok });
};
