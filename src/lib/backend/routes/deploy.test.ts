import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';
import type { CmsDeployAdapter, CmsDeployContext, CmsDeployState } from '../types.js';
import { CmsDeployError } from './deploy.js';

const idle: CmsDeployState = {
	available: true,
	site: { url: 'https://site.example' },
	latest: null
};
const started: CmsDeployState = {
	...idle,
	latest: { id: 'd1', status: 'building', createdAt: '2026-09-14T15:00:00.000Z' }
};

describe('/deploy without an adapter', () => {
	let fx: TestFixture;
	beforeEach(async () => {
		fx = await createTestFixture();
	});

	it('GET reports the action as unavailable', async () => {
		const res = await fx.alice.get('/deploy');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ available: false });
	});

	it('POST is a 404', async () => {
		const res = await fx.alice.post('/deploy');
		expect(res.status).toBe(404);
	});

	it('is an editor-only route', async () => {
		expect((await fx.anon.get('/deploy')).status).toBe(403);
		expect((await fx.anon.post('/deploy')).status).toBe(403);
	});
});

describe('/deploy with an adapter', () => {
	let fx: TestFixture;
	let calls: { method: 'status' | 'trigger'; ctx: CmsDeployContext }[];
	let trigger: CmsDeployAdapter['trigger'];

	beforeEach(async () => {
		calls = [];
		trigger = async () => started;
		const deploy: CmsDeployAdapter = {
			status: async (ctx) => {
				calls.push({ method: 'status', ctx });
				return idle;
			},
			trigger: (ctx) => {
				calls.push({ method: 'trigger', ctx });
				return trigger(ctx);
			}
		};
		fx = await createTestFixture({ backend: { deploy } });
	});

	it('GET returns the adapter state and hands it the request context', async () => {
		const res = await fx.alice.get('/deploy');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(idle);
		expect(calls).toHaveLength(1);
		const { method, ctx } = calls[0]!;
		expect(method).toBe('status');
		expect(ctx.projectId).toBe('p1');
		expect(ctx.user.id).toBe(fx.users.alice.id);
		expect(ctx.store).toBe(fx.backend.store);
		expect(ctx.event.request.method).toBe('GET');
	});

	it('POST triggers and answers 202 with the new state', async () => {
		const res = await fx.alice.post('/deploy');
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual(started);
		expect(calls.map((c) => c.method)).toEqual(['trigger']);
	});

	it('maps a CmsDeployError to its status with a plain-text body', async () => {
		trigger = async () => {
			throw new CmsDeployError(409, 'a deploy is already in progress');
		};
		const res = await fx.alice.post('/deploy');
		expect(res.status).toBe(409);
		expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
		expect(res.text).toBe('a deploy is already in progress');
	});

	it('turns any other adapter failure into a bare 500', async () => {
		trigger = async () => {
			throw new Error('boom');
		};
		const res = await fx.alice.post('/deploy');
		expect(res.status).toBe(500);
		expect(res.text).toBe('');
	});

	it('never reaches the adapter for a project the editor cannot act on', async () => {
		const res = await fx.at('p_bob', fx.alice).get('/deploy');
		expect(res.status).toBe(403);
		expect(calls).toHaveLength(0);
	});
});
