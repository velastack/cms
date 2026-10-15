import { dev } from '$app/env';
import { error, type RequestHandler } from '@sveltejs/kit';

export const prerender = false;

export const fallback: RequestHandler = async (event) => {
	if (!dev) error(404);
	const { backend } = await import('../../../dev-backend.js');
	return backend.handler(event);
};
