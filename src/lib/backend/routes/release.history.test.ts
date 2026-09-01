import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';

let fx: TestFixture;
const reset = (seed: Record<string, unknown> = {}) => fx.backend.testing.reset('p1', seed);
const get = (path: string, init?: Record<string, unknown>) => fx.anon.get(path, init);
const post = (path: string, init?: Record<string, unknown>) => fx.anon.post(path, init);
const del = (path: string, init?: Record<string, unknown>) => fx.anon.del(path, init);
const as = (user: string) => (user === 'bob' ? fx.bob : fx.alice);

beforeEach(async () => {
	fx = await createTestFixture();
});

describe('GET /release/history', () => {
	beforeEach(() => reset());

	it('returns an empty list when no releases have been published', async () => {
		const res = await fx.alice.get('/release/history');
		expect(res.status).toBe(200);
		expect(res.json<any>().history).toEqual([]);
	});

	it('returns published releases sorted desc by publishedAt', async () => {
		const publishOne = async (val: string, name: string) => {
			await fx.alice.post('/release/items', {
				body: {
					items: [{ kind: 'layout', routeId: '/', locale: 'en', tree: { x: val } }]
				}
			});
			await fx.alice.post('/release/publish', { body: { name } });
			// Tiny delay so publishedAt differs (ISO ms-resolution).
			await new Promise((r) => setTimeout(r, 5));
		};

		await publishOne('1', 'first');
		await publishOne('2', 'second');
		await publishOne('3', 'third');

		const res = await fx.alice.get('/release/history');
		expect(res.json<any>().history.map((h: { name?: string }) => h.name)).toEqual([
			'third',
			'second',
			'first'
		]);
		for (let i = 1; i < res.json<any>().history.length; i++) {
			expect(
				res.json<any>().history[i - 1].publishedAt >= res.json<any>().history[i].publishedAt
			).toBe(true);
		}
	});
});
