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
 *   the way a browser would make it work. The jar models `Path`: a request
 *   carries only the cookies whose path covers it, longest path first, and
 *   `cookies.get` keeps the first of a duplicate name the way `cookie.parse`
 *   does. That is what lets a test prove two mounts hold independent sessions
 *   rather than pass because every cookie went everywhere.
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

export type JarEntry = { name: string; value: string; path: string };

/** The client's cookies, kept by name and path the way a browser keeps them. */
export type CmsCookieJar = {
	/** The value the client would send to its own mount, or `undefined`. */
	get(name: string): string | undefined;
	set(name: string, value: string, path: string): void;
	delete(name: string, path: string): void;
	/** Every stored cookie with its path, for asserting on scoping. */
	all(): readonly JarEntry[];
	/** The `cookie` header a request to `pathname` would carry. */
	headerFor(pathname: string): string | undefined;
};

export type CmsTestClient = {
	get(path: string, init?: RequestInitLike): Promise<TestResponse>;
	post(path: string, init?: RequestInitLike): Promise<TestResponse>;
	del(path: string, init?: RequestInitLike): Promise<TestResponse>;
	request(method: string, path: string, init?: RequestInitLike): Promise<TestResponse>;
	/** A client that sends this cookie on every request. Root-scoped by
	 * default — what a login from before 0.3.1 left behind, and what lets
	 * `at()` carry it to another mount so cross-project authorization is
	 * exercised. Pass a path to model a mount-scoped cookie. */
	as(cookie: string, path?: string): CmsTestClient;
	/** A client mounted at a different base path / route params. */
	at(basePath: string, params?: Record<string, string>): CmsTestClient;
	/** The cookie jar accumulated from `set-cookie` responses. */
	cookies: CmsCookieJar;
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

/** RFC 6265 §5.1.4. */
const pathMatches = (requestPath: string, cookiePath: string): boolean =>
	requestPath === cookiePath ||
	(requestPath.startsWith(cookiePath) &&
		(cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'));

/** Longest path first, as RFC 6265 §5.4 asks of browsers; the sort is stable,
 * so equal paths keep their order of arrival. */
const byPathLength = <T extends { path: string }>(list: T[]): T[] =>
	list.sort((a, b) => b.path.length - a.path.length);

const createJar = (basePath: string): CmsCookieJar => {
	// Keyed the way SvelteKit keys cookies it sets: by path and name.
	const entries = new Map<string, JarEntry>();
	const key = (name: string, path: string) => `${path}?${name}`;
	const matching = (pathname: string) =>
		byPathLength([...entries.values()].filter((e) => pathMatches(pathname, e.path)));
	return {
		get: (name) => matching(basePath).find((e) => e.name === name)?.value,
		set: (name, value, path) => {
			entries.set(key(name, path), { name, value, path });
		},
		delete: (name, path) => {
			entries.delete(key(name, path));
		},
		all: () => [...entries.values()],
		headerFor: (pathname) => {
			const list = matching(pathname);
			return list.length > 0 ? list.map((e) => `${e.name}=${e.value}`).join('; ') : undefined;
		}
	};
};

/** Like `cookie.parse`: the first of a duplicate name wins. */
const parseCookieHeader = (header: string | undefined): Map<string, string> => {
	const out = new Map<string, string>();
	if (!header) return out;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		if (!out.has(name)) out.set(name, part.slice(eq + 1).trim());
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

type NewCookie = { name: string; value: string; path: string; maxAge?: number };

export const createCmsTestClient = (
	backend: CmsBackend,
	options: TestClientOptions
): CmsTestClient => {
	const restParam = options.restParam ?? 'path';
	const origin = options.origin ?? 'http://localhost';
	const basePath = options.basePath.replace(/\/$/, '');
	const jar = createJar(basePath);

	const run = async (
		method: string,
		path: string,
		init: RequestInitLike = {}
	): Promise<TestResponse> => {
		const url = new URL(`${basePath}${path.startsWith('/') ? path : `/${path}`}`, origin);
		const rest = url.pathname.slice(basePath.length).replace(/^\//, '');

		const headers = new Headers(init.headers ?? {});
		const cookieHeader = init.cookie ?? jar.headerFor(url.pathname);
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

		// Mirrors SvelteKit: `set` insists on a path; a cookie set during this
		// request shadows the one it carried, longest path first; one expired
		// here reads as absent.
		const newCookies = new Map<string, NewCookie>();
		const pending: string[] = [];
		const fresh = (name: string): NewCookie | undefined =>
			byPathLength(
				[...newCookies.values()].filter((c) => c.name === name && pathMatches(url.pathname, c.path))
			)[0];
		const set = (name: string, value: string, opts: Record<string, unknown>) => {
			if (typeof opts.path !== 'string') {
				throw new Error('You must specify a `path` when setting, deleting or serializing cookies');
			}
			const maxAge = typeof opts.maxAge === 'number' ? opts.maxAge : undefined;
			newCookies.set(`${opts.path}?${name}`, { name, value, path: opts.path, maxAge });
			pending.push(serializeCookie(name, value, opts));
		};
		const cookies = {
			get: (name: string) => {
				const c = fresh(name);
				if (c) return c.maxAge === 0 ? undefined : c.value;
				return requestCookies.get(name);
			},
			getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
			set,
			delete: (name: string, opts: Record<string, unknown>) =>
				set(name, '', { ...opts, maxAge: 0 }),
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

		for (const c of newCookies.values()) {
			if (c.maxAge === 0) jar.delete(c.name, c.path);
			else jar.set(c.name, c.value, c.path);
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
		as: (cookie, path = '/') => {
			const scoped = createCmsTestClient(backend, options);
			const [name, ...rest] = cookie.split('=');
			scoped.cookies.set(name.trim(), rest.join('='), path);
			return scoped;
		},
		// Carries the cookie jar across, paths included, so
		// `client.as(session).at(otherProject)` is the same browser visiting a
		// different mount — which is exactly the cross-project authorization
		// case — and a mount-scoped cookie stays behind the way it would in a
		// browser.
		at: (nextBasePath, params) => {
			const scoped = createCmsTestClient(backend, {
				...options,
				basePath: nextBasePath,
				params
			});
			for (const e of jar.all()) scoped.cookies.set(e.name, e.value, e.path);
			return scoped;
		},
		cookies: jar
	};
	return client;
};
