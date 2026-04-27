import type { RequestHandler } from '@sveltejs/kit';

// MOCK ONLY — the cookie value doubles as the userId, so different cookie
// values give different mock users (and therefore different open releases).
// Set `cms_session` to any value in devtools to simulate a signed-in user;
// clear it for unauthed.
export const GET: RequestHandler = async ({ cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });
	return Response.json({ user: { id: userId, name: 'John Doe' } });
};
