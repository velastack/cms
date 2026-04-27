import type { RequestHandler } from '@sveltejs/kit';
import { getReleaseHistory } from '../../_store.js';

// MOCK ONLY — cookie value gates access; any signed-in user sees full history.
export const GET: RequestHandler = async ({ cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });
	const history = getReleaseHistory()
		.slice()
		.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
	return Response.json({ history });
};
