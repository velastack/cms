/**
 * `@velastack/cms/backend` — the CMS HTTP API, mountable at any path.
 *
 * ```ts
 * // src/lib/server/cms.ts
 * import { createCmsBackend } from '@velastack/cms/backend';
 * export const cms = createCmsBackend();
 *
 * // src/routes/cms/[...path]/+server.ts
 * import { cms } from '$lib/server/cms';
 * export const prerender = false;
 * export const fallback = cms.handler;
 * ```
 *
 * Multi-tenant is the same file with a `resolveProject`:
 *
 * ```ts
 * createCmsBackend({ resolveProject: (event) => event.params.project_id ?? null });
 * ```
 *
 * Requires `better-sqlite3`, declared as an optional peer dependency — projects
 * that only use the components and the SSR read path never install it.
 *
 * Two things a cross-origin deployment must get right. `cors` is off by
 * default; enabling it with an `origin` predicate that returns `true`
 * unconditionally lets any site drive the mutating endpoints with a signed-in
 * editor's cookie, because SvelteKit's CSRF check only guards form content
 * types and these are JSON. And SvelteKit *does* guard `multipart/form-data`,
 * so a cross-origin `POST /media` needs the site's origin in
 * `kit.csrf.trustedOrigins` — that check is production-only, so it will not
 * show up in `vela dev`.
 */
export { createCmsBackend, type CmsBackend } from './factory.js';
export { localEditors, type LocalEditorsOptions } from './auth/local-editors.js';
export {
	createEditorStore,
	type CmsEditorStore,
	type CreateEditorInput,
	type CmsSessionToken
} from './auth/editors.js';
export { hashPassword, verifyPassword, type ScryptParams } from './auth/scrypt.js';
export { createCmsTestClient, type CmsTestClient, type TestResponse } from './testing/harness.js';
export {
	createTestFixture,
	TEST_SCRYPT,
	type TestFixture,
	type TestFixtureOptions
} from './testing/fixtures.js';

export type {
	CmsAuthAdapter,
	CmsAuthContext,
	CmsBackendOptions,
	CmsCookieOptions,
	CmsCorsOptions,
	CmsEditor,
	CmsSessionGrant
} from './types.js';
export type { SqliteDb, SqliteStatement } from './store/sqlite.js';
export type { Migration } from './store/migrations/index.js';
export { MIGRATIONS } from './store/migrations/index.js';

// The wire contract, so a host can type its own integrations against it.
export type {
	DocsResponse,
	MediaItem,
	OpenRelease,
	PageMapEntry,
	PageMapRoute,
	PagesResponse,
	PagesRoute,
	PublishedRelease,
	ReleaseItem,
	SiteResponse
} from '../core/wire.js';
export type { PageDeleteOutcome, PageEntry } from '../core/page-entry.js';
export type { Tree } from '../core/path.js';
