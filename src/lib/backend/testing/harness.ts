/**
 * An in-process client for the backend.
 *
 * The suites this replaces drove a separate `vela dev` process over HTTP, which
 * forced `fileParallelism: false` because every test file shared one on-disk
 * database. Calling the handler directly lets each file hold its own
 * `':memory:'` database and run in parallel.
 *
 * The `RequestEvent` shim reproduces the parts of SvelteKit the handlers
 * actually rely on, and reproduces them *exactly* where it matters:
 *
 * - `setHeaders` lowercases, throws on a duplicate key, and throws on
 *   `set-cookie` — the cache responders depend on never double-setting.
 * - After the handler returns, accumulated headers are applied *over* the
 *   response, so `setHeaders` wins. The public-read cache assertions are
 *   meaningless if this precedence is not right.
 * - Cookies set during a request are serialised into `set-cookie` and folded
 *   into the client's jar, so a login followed by an authenticated read works
 *   the way a browser would make it work.
 */
import type { RequestEvent } from '@sveltejs/kit';
import type { CmsBackend } from '../factory.js';

export type TestResponse = {
	status: number;
	headers: Headers;
	text: string;
	json<T = unknown>(): T;
};

export type RequestInitLike = {
	body?: unknown;
	formData?: FormData;
	headers?: Record<string, string>;
	cookie?: string;
};

export type CmsTestClient = {
	get(path: string, init?: RequestInitLike): Promise<TestResponse>;
	post(path: string, init?: RequestInitLike): Promise<TestResponse>;
	del(path: string, init?: RequestInitLike): Promise<TestResponse>;
	request(method: string, path: string, init?: RequestInitLike): Promise<TestResponse>;
	/** A client that sends this cookie on every request. */
	as(cookie: string): CmsTestClient;
	/** A client mounted at a different base path / route params. */
	at(basePath: string, params?: Record<string, string>): CmsTestClient;
	/** The cookie jar accumulated from `set-cookie` responses. */
	cookies: Map<string, string>;
};

export type TestClientOptions = {
	/** Where the backend is mounted, e.g. `/v1/projects/p1/cms`. */
	basePath: string;
	/** Route params other than the rest parameter, e.g. `{ project_id: 'p1' }`. */
	params?: Record<string, string>;
	/** Name of the rest parameter. Must match the backend's `restParam`. */
	restParam?: string;
	origin?: string;
};

const parseCookieHeader = (header: string | undefined): Map<string, string> => {
	const out = new Map<string, string>();
	if (!header) return out;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		out.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
	}
	return out;
};

const serializeCookie = (name: string, value: string, opts: Record<string, unknown>): string => {
	const bits = [`${name}=${encodeURIComponent(value)}`];
	if (opts.path) bits.push(`Path=${opts.path}`);
	if (typeof opts.maxAge === 'number') bits.push(`Max-Age=${opts.maxAge}`);
	if (opts.httpOnly) bits.push('HttpOnly');
	if (opts.secure) bits.push('Secure');
	if (opts.partitioned) bits.push('Partitioned');
	if (opts.sameSite) {
		const v = String(opts.sameSite);
		bits.push(`SameSite=${v.charAt(0).toUpperCase()}${v.slice(1)}`);
	}
	return bits.join('; ');
};

export const createCmsTestClient = (
	backend: CmsBackend,
	options: TestClientOptions
): CmsTestClient => {
	const restParam = options.restParam ?? 'path';
	const origin = options.origin ?? 'http://localhost';
	const basePath = options.basePath.replace(/\/$/, '');
	const jar = new Map<string, string>();

	const run = async (
		method: string,
		path: string,
		init: RequestInitLike = {}
	): Promise<TestResponse> => {
		const url = new URL(`${basePath}${path.startsWith('/') ? path : `/${path}`}`, origin);
		const rest = url.pathname.slice(basePath.length).replace(/^\//, '');

		const headers = new Headers(init.headers ?? {});
		const cookieHeader =
			init.cookie ?? (jar.size > 0 ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : undefined);
		if (cookieHeader) headers.set('cookie', cookieHeader);

		let body: BodyInit | undefined;
		if (init.formData) {
			body = init.formData;
		} else if (init.body !== undefined) {
			body = JSON.stringify(init.body);
			if (!headers.has('content-type')) headers.set('content-type', 'application/json');
		}

		const request = new Request(url, { method, headers, body });
		const requestCookies = parseCookieHeader(headers.get('cookie') ?? undefined);

		// Mirrors SvelteKit: lowercase keys, duplicates throw, set-cookie throws.
		const accumulated: Record<string, string> = {};
		const setHeaders = (newHeaders: Record<string, string>): void => {
			for (const key in newHeaders) {
				const lower = key.toLowerCase();
				if (lower === 'set-cookie') {
					throw new Error('Use `event.cookies.set` instead of `event.setHeaders` to set cookies');
				}
				if (lower in accumulated) {
					throw new Error(`"${key}" header is already set`);
				}
				accumulated[lower] = newHeaders[key];
			}
		};

		const pending: string[] = [];
		const cookies = {
			get: (name: string) => requestCookies.get(name),
			getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string, opts: Record<string, unknown>) => {
				requestCookies.set(name, value);
				pending.push(serializeCookie(name, value, opts));
			},
			delete: (name: string, opts: Record<string, unknown>) => {
				requestCookies.delete(name);
				pending.push(serializeCookie(name, '', { ...opts, maxAge: 0 }));
			},
			serialize: serializeCookie
		};

		const event = {
			request,
			url,
			params: { ...(options.params ?? {}), [restParam]: rest },
			locals: {},
			cookies,
			setHeaders,
			route: { id: `${basePath}/[...${restParam}]` },
			isDataRequest: false,
			isSubRequest: false,
			isRemoteRequest: false,
			platform: undefined,
			getClientAddress: () => '127.0.0.1',
			fetch: globalThis.fetch
		} as unknown as RequestEvent;

		const response = await backend.handle(event);

		// SvelteKit applies accumulated headers over the response, then appends
		// cookies. Order matters: setHeaders wins.
		for (const [k, v] of Object.entries(accumulated)) response.headers.set(k, v);
		for (const c of pending) response.headers.append('set-cookie', c);

		for (const c of pending) {
			const [pair] = c.split(';');
			const eq = pair.indexOf('=');
			const name = pair.slice(0, eq);
			const value = decodeURIComponent(pair.slice(eq + 1));
			if (/Max-Age=0/.test(c)) jar.delete(name);
			else jar.set(name, value);
		}

		const text = await response.text();
		return {
			status: response.status,
			headers: response.headers,
			text,
			json: <T>() => JSON.parse(text) as T
		};
	};

	const client: CmsTestClient = {
		request: run,
		get: (path, init) => run('GET', path, init),
		post: (path, init) => run('POST', path, init),
		del: (path, init) => run('DELETE', path, init),
		as: (cookie) => {
			const scoped = createCmsTestClient(backend, options);
			const [name, ...rest] = cookie.split('=');
			scoped.cookies.set(name.trim(), rest.join('='));
			return scoped;
		},
		// Carries the cookie jar across, so `client.as(session).at(otherProject)`
		// is the same browser visiting a different mount — which is exactly the
		// cross-project authorization case.
		at: (nextBasePath, params) => {
			const scoped = createCmsTestClient(backend, {
				...options,
				basePath: nextBasePath,
				params
			});
			for (const [k, v] of jar) scoped.cookies.set(k, v);
			return scoped;
		},
		cookies: jar
	};
	return client;
};
