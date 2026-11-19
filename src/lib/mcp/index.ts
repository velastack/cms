/**
 * `@velastack/cms/mcp` — the CMS as an MCP server, so people can edit their
 * site from ChatGPT, Claude or any other MCP client.
 *
 * ```ts
 * // src/lib/server/cms-mcp.ts
 * import { createCmsMcp } from '@velastack/cms/mcp';
 * import { cms } from '#lib/server/cms.js';
 *
 * export const mcp = createCmsMcp({
 * 	backend: cms,
 * 	verifyToken: async (token, event) => …,   // who the token stands for
 * 	sites: async (principal, event) => …      // what they may edit
 * });
 *
 * // src/routes/mcp/+server.ts
 * export const fallback = mcp.handler;
 *
 * // src/routes/.well-known/oauth-protected-resource/mcp/+server.ts
 * export const GET = mcp.metadata;
 * ```
 *
 * The server is an OAuth 2.1 resource server and nothing more: it never sees
 * a password and issues no tokens. `verifyToken` asks whatever authorization
 * server the host uses what a bearer token stands for, and the metadata route
 * tells clients where that authorization server is. Any one will do; with
 * PocketBase it is [pocketbase-oauth](https://github.com/velastack/pocketbase-oauth).
 */
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import {
	McpServer,
	OAuthError,
	OAuthErrorCode,
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	requireBearerAuth,
	type AuthInfo
} from '@modelcontextprotocol/server';
import type { PublishedRelease } from '../core/wire.js';
import type { CmsBackend } from '../backend/factory.js';
import type { CmsEditor } from '../backend/types.js';
import {
	CMS_INSTRUCTIONS,
	SCOPE_CONTENT_READ,
	SCOPE_CONTENT_WRITE,
	registerCmsTools,
	type CmsMcpSite
} from './tools.js';

export {
	CMS_INSTRUCTIONS,
	SCOPE_CONTENT_READ,
	SCOPE_CONTENT_WRITE,
	registerCmsTools,
	type CmsMcpSite,
	type CmsToolsContext
} from './tools.js';
export { McpServer, requireScopes } from '@modelcontextprotocol/server';

/** Who a bearer token stands for, as the host's authorization server reports it. */
export type CmsMcpPrincipal = {
	/** The person; releases are published under this editor. */
	editor: CmsEditor;
	scopes: string[];
	clientId: string;
	/** Seconds since the epoch. A token without an expiry is refused. */
	expiresAt: number;
	/**
	 * The resource the token was issued for (its audience). A token issued
	 * for anything but this server's own URL is refused, so this must be
	 * filled in.
	 */
	resource: string | null;
};

/** What a tool registered through `extend` is given. */
export type CmsMcpRequest = {
	event: RequestEvent;
	principal: CmsMcpPrincipal;
};

export type CmsMcpOptions = {
	backend: Pick<CmsBackend, 'store' | 'cache'>;
	/**
	 * What a bearer token stands for, or null when it is unknown, expired or
	 * revoked. Usually one introspection call to the authorization server.
	 */
	verifyToken: (token: string, event: RequestEvent) => Promise<CmsMcpPrincipal | null>;
	/** The sites the person may work on. Asked on every tool call. */
	sites: (request: CmsMcpRequest) => Promise<CmsMcpSite[]> | CmsMcpSite[];
	/**
	 * The authorization server clients are sent to: its issuer URL. Defaults
	 * to the origin the request came in on, which is right when the
	 * authorization server is served by the same app.
	 */
	issuer?: (event: RequestEvent) => string;
	/** See `CmsToolsContext.afterPublish`. */
	afterPublish?: (
		site: CmsMcpSite,
		release: PublishedRelease,
		request: CmsMcpRequest
	) => Promise<string | void>;
	/**
	 * Register the host's own tools next to the content tools. Use
	 * `requireScopes` on those that need a scope, and list the scopes in
	 * `scopes` so clients know to ask for them.
	 */
	extend?: (server: McpServer, request: CmsMcpRequest) => void | Promise<void>;
	/** Scopes of the host's own tools, advertised with the content scopes. */
	scopes?: string[];
	/** Shown to the person by their client. Defaults to "Website content". */
	name?: string;
	version?: string;
	/** Told to the assistant after the content instructions. */
	instructions?: string;
};

export type CmsMcp = {
	/** The MCP endpoint. Export it as `fallback` from the route's `+server.ts`. */
	handler: RequestHandler;
	/**
	 * The protected resource metadata (RFC 9728). Export it as `GET` from
	 * `/.well-known/oauth-protected-resource/<the endpoint's path>/+server.ts`.
	 */
	metadata: RequestHandler;
	/** Every scope this server understands. */
	scopes: string[];
};

/**
 * What a browser-based client needs to call this from another origin. A
 * bearer token is not sent by the browser on its own, so allowing every
 * origin gives a page nothing it was not handed.
 */
const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
	'access-control-allow-headers':
		'authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id',
	'access-control-expose-headers': 'www-authenticate, mcp-session-id, mcp-protocol-version',
	'access-control-max-age': '86400'
};

const withCors = (response: Response): Response => {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
};

const WELL_KNOWN = '/.well-known/oauth-protected-resource';

/** The server's own URL: its resource identifier, without a trailing slash. */
const resourceUrl = (event: RequestEvent, pathname = event.url.pathname) =>
	new URL(event.url.origin + pathname.replace(/\/+$/, ''));

export const createCmsMcp = (options: CmsMcpOptions): CmsMcp => {
	const scopes = [SCOPE_CONTENT_READ, SCOPE_CONTENT_WRITE, ...(options.scopes ?? [])];
	const issuer = (event: RequestEvent) => options.issuer?.(event) ?? event.url.origin;

	// One server per request, built for whoever the token stands for.
	const mcp = createMcpHandler(
		async ({ authInfo }) => {
			const request = authInfo?.extra?.request as CmsMcpRequest | undefined;
			if (!request) throw new Error('the MCP handler was reached without a verified token');

			const server = new McpServer(
				{ name: options.name ?? 'Website content', version: options.version ?? '1.0.0' },
				{
					instructions: [CMS_INSTRUCTIONS, options.instructions].filter(Boolean).join('\n\n')
				}
			);
			registerCmsTools(server, {
				backend: options.backend,
				editor: request.principal.editor,
				sites: () => options.sites(request),
				afterPublish: options.afterPublish
					? (site, release) => options.afterPublish!(site, release, request)
					: undefined
			});
			await options.extend?.(server, request);
			return server;
		},
		{ onerror: (error) => console.error('[cms mcp]', error) }
	);

	const handler: RequestHandler = async (event) => {
		if (event.request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS });
		}

		const resource = resourceUrl(event);
		const gate = requireBearerAuth({
			verifier: {
				verifyAccessToken: async (token): Promise<AuthInfo> => {
					const principal = await options.verifyToken(token, event);
					if (!principal) {
						throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid.');
					}
					return {
						token,
						clientId: principal.clientId,
						scopes: principal.scopes,
						expiresAt: principal.expiresAt,
						...(principal.resource ? { resource: new URL(principal.resource) } : {}),
						extra: { request: { event, principal } satisfies CmsMcpRequest }
					};
				}
			},
			// A token issued for another server must not work here.
			expectedResource: resource,
			// No `requiredScopes`: a client told no scope asks for everything
			// in the metadata, and the consent page lets the person decide.
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource)
		});

		const auth = await gate(event.request);
		if (auth instanceof Response) return withCors(auth);
		return withCors(await mcp.fetch(event.request, { authInfo: auth }));
	};

	const metadata: RequestHandler = (event) => {
		const at = event.url.pathname.indexOf(WELL_KNOWN);
		const path = at === -1 ? '' : event.url.pathname.slice(at + WELL_KNOWN.length);
		return new Response(
			JSON.stringify({
				resource: resourceUrl(event, path).href.replace(/\/$/, ''),
				authorization_servers: [issuer(event)],
				scopes_supported: scopes,
				bearer_methods_supported: ['header'],
				resource_name: options.name ?? 'Website content'
			}),
			{
				headers: {
					'content-type': 'application/json',
					'cache-control': 'public, max-age=300',
					'access-control-allow-origin': '*'
				}
			}
		);
	};

	return { handler, metadata, scopes };
};
