import type { RequestHandler } from '@sveltejs/kit';
import { regeneratePreviewKey } from '../../_store.js';

// MOCK ONLY — cookie value doubles as the userId.
export const POST: RequestHandler = async ({ cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });
	const key = regeneratePreviewKey(userId);
	if (!key) return new Response('no open release', { status: 404 });
	return Response.json({ preview_key: key });
};
