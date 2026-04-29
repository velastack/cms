import type { RequestEvent } from '@sveltejs/kit';

/**
 * Synthesize the minimum {@link RequestEvent} shape velacms's API handlers
 * read: `url`, `request`, `cookies.get`, `params`. We intentionally don't
 * mock fields the handlers don't touch — if a handler later needs more,
 * extend this helper instead of growing the type to a full event.
 */
export type EventInit = {
	url?: string;
	method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
	body?: unknown;
	cookies?: Record<string, string>;
	params?: Record<string, string>;
};

export const makeEvent = (init: EventInit = {}): RequestEvent => {
	const url = new URL(init.url ?? 'http://localhost/');
	const method = init.method ?? 'GET';

	const requestInit: RequestInit = { method };
	if (init.body !== undefined) {
		const isStringBody = typeof init.body === 'string';
		requestInit.body = isStringBody ? (init.body as string) : JSON.stringify(init.body);
		if (!isStringBody) {
			requestInit.headers = { 'content-type': 'application/json' };
		}
	}
	const request = new Request(url, requestInit);

	const cookies = init.cookies ?? {};
	const cookieJar = {
		get: (name: string): string | undefined => cookies[name]
	};

	return {
		url,
		request,
		cookies: cookieJar,
		params: init.params ?? {}
	} as unknown as RequestEvent;
};

/** Parse a `Response`'s JSON body, asserting status. */
export const expectJson = async (response: Response, status = 200): Promise<unknown> => {
	if (response.status !== status) {
		throw new Error(
			`Expected status ${status} but got ${response.status}${
				response.headers.get('content-type')?.includes('text/') ? `: ${await response.text()}` : ''
			}`
		);
	}
	return response.json();
};
