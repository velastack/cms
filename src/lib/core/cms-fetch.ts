/**
 * `fetch` for the CMS endpoint's mutating routes, with the editor's session
 * cookie (`credentials: 'include'`) unless the caller overrides it.
 *
 * SvelteKit 3 treats a cross-origin `POST`/`PUT`/`PATCH`/`DELETE` that has no
 * `content-type` like a form submission, and rejects it with a 403 unless the
 * site's origin is in the backend's `csrf.trustedOrigins`. The admin bar talks
 * to a cross-origin endpoint whenever the CMS is hosted (velastack.dev), so a
 * bodiless mutation gets `content-type: application/json`. That turns it into a
 * CORS-preflighted request, which the backend's `cors` option already answers.
 *
 * A caller-set `content-type` is kept, and so is the browser's own for a
 * `FormData`, `Blob` or `URLSearchParams` body: multipart uploads keep their
 * boundary.
 */
export const cmsFetch = (input: string | URL, init: RequestInit = {}): Promise<Response> => {
	const method = (init.method ?? 'GET').toUpperCase();
	const headers = new Headers(init.headers);
	const bodyHasOwnType = init.body != null && typeof init.body !== 'string';
	if (method !== 'GET' && method !== 'HEAD' && !headers.has('content-type') && !bodyHasOwnType) {
		headers.set('content-type', 'application/json');
	}
	return fetch(input, { credentials: 'include', ...init, headers });
};
