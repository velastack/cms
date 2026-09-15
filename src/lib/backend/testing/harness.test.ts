import { beforeEach, describe, expect, it } from 'vitest';
import { createTestFixture, type TestFixture } from './fixtures.js';
import type { CmsTestClient } from './harness.js';

/**
 * The jar has to behave like a browser's for the cookie-scoping tests to mean
 * anything: only path-matching cookies travel, longest path first.
 */
let fx: TestFixture;

const token = (who: 'alice' | 'bob') => fx.backend.editors.createSession(fx.users[who].id).token;
const email = async (c: CmsTestClient) =>
	(await c.get('/user')).json<{ user: { email: string } }>().user.email;

beforeEach(async () => {
	fx = await createTestFixture();
});

describe('cookie jar', () => {
	it('sends a root-scoped cookie to every mount', async () => {
		expect((await fx.alice.get('/user')).status).toBe(200);
		expect((await fx.at('p_alice', fx.alice).get('/user')).status).toBe(200);
	});

	it('keeps a mount-scoped cookie off other mounts', async () => {
		const scoped = fx.anon.as(`cms_session=${token('alice')}`, '/v1/projects/p1/cms');
		expect((await scoped.get('/user')).status).toBe(200);
		expect((await fx.at('p_alice', scoped).get('/user')).status).toBe(403);
	});

	it('sends the longest path first, so the scoped session wins', async () => {
		const c = fx.anon.as(`cms_session=${token('alice')}`);
		c.cookies.set('cms_session', token('bob'), '/v1/projects/p1/cms');
		expect(await email(c)).toBe('bob@example.com');
		expect(await email(fx.at('p_alice', c))).toBe('alice@example.com');
	});
});
