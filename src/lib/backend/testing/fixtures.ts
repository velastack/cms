/**
 * Setup for tests that drive the backend over its HTTP surface.
 *
 * Each call builds an isolated `':memory:'` backend with two editors, so test
 * files hold no shared state and run in parallel. Password hashing is dialled
 * right down — these tests are about routing and content, and real scrypt
 * parameters would dominate the run.
 *
 * Exported from `@velastack/cms/backend` because a host integrating its own
 * auth adapter wants the same harness for its own tests.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from './harness.js';
import type { CmsBackendOptions, CmsEditor } from '../types.js';

/** Cheap on purpose: fast enough to run per test, real enough to exercise the
 * same code path as production. */
export const TEST_SCRYPT = { N: 1024, r: 8, p: 1 };

export type TestFixture = {
	backend: CmsBackend;
	/** Unauthenticated client for the default project. */
	anon: CmsTestClient;
	/** Signed in as alice, who can reach `p1` and `p_alice`. */
	alice: CmsTestClient;
	/** Signed in as bob, who can reach `p1` and `p_bob`. */
	bob: CmsTestClient;
	users: { alice: CmsEditor; bob: CmsEditor };
	/** A client for another project, optionally carrying a session. */
	at: (projectId: string, as?: CmsTestClient) => CmsTestClient;
	uploadDir: string;
};

export type TestFixtureOptions = {
	/** Defaults to `p1`. */
	projectId?: string;
	/** Mount path. Defaults to the multi-tenant shape so params are exercised. */
	basePath?: (projectId: string) => string;
	backend?: Partial<CmsBackendOptions>;
};

/**
 * Two accounts sharing one project and each holding a private one — enough to
 * exercise collaboration (same publish queue, conflicting drafts) and
 * cross-project denial without a third.
 */
export const createTestFixture = async (options: TestFixtureOptions = {}): Promise<TestFixture> => {
	const projectId = options.projectId ?? 'p1';
	const basePath = options.basePath ?? ((p: string) => `/v1/projects/${p}/cms`);
	const uploadDir = mkdtempSync(join(tmpdir(), 'vela-cms-test-'));

	const backend = createCmsBackend({
		dbPath: ':memory:',
		uploadDir,
		testReset: true,
		auth: localEditors({ scrypt: TEST_SCRYPT }),
		resolveProject: (event) =>
			(event.params as Record<string, string | undefined>).project_id ?? projectId,
		...options.backend
	});

	const alice = await backend.editors.create({
		email: 'alice@example.com',
		password: 'password',
		name: 'Alice',
		projects: [projectId, 'p_alice']
	});
	const bob = await backend.editors.create({
		email: 'bob@example.com',
		password: 'password',
		name: 'Bob',
		projects: [projectId, 'p_bob']
	});

	const clientFor = (p: string) =>
		createCmsTestClient(backend, { basePath: basePath(p), params: { project_id: p } });

	const anon = clientFor(projectId);

	return {
		backend,
		anon,
		alice: anon.as(`cms_session=${backend.editors.createSession(alice.id).token}`),
		bob: anon.as(`cms_session=${backend.editors.createSession(bob.id).token}`),
		users: { alice, bob },
		at: (p, as) => (as ?? anon).at(basePath(p), { project_id: p }),
		uploadDir
	};
};
