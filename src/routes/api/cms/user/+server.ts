import type { RequestHandler } from '@sveltejs/kit';

// MOCK ONLY — cookie gate stands in for real auth. Set `cms_session` to any
// value in devtools to simulate a signed-in user; clear it for unauthed.
export const GET: RequestHandler = async ({ cookies }) => {
	if (!cookies.get('cms_session')) return new Response(null, { status: 403 });
	return Response.json({ user: { id: '123', name: 'John Doe' } });
};
