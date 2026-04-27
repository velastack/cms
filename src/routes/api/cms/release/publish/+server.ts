import type { RequestHandler } from '@sveltejs/kit';
import { publishRelease } from '../../_store.js';

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

// MOCK ONLY — cookie value doubles as the userId.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = cookies.get('cms_session');
	if (!userId) return new Response(null, { status: 403 });

	let name: string | undefined;
	const text = await request.text();
	if (text) {
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return new Response('invalid json', { status: 400 });
		}
		if (!isObjectRecord(body)) return new Response('object body required', { status: 400 });
		if (body.name != null) {
			if (typeof body.name !== 'string') return new Response('name must be a string', { status: 400 });
			name = body.name;
		}
	}

	const published = publishRelease(userId, name);
	if (!published) return new Response('no open release to publish', { status: 404 });
	return Response.json({ release: published });
};
