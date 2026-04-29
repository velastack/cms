import { beforeEach, describe, expect, it } from 'vitest';
import { expectJson, makeEvent } from './helpers.js';
import { __resetStoreForTests } from '../_store.js';
import { GET as historyGet } from '../release/history/+server.js';
import { POST as itemsPost } from '../release/items/+server.js';
import { POST as publishPost } from '../release/publish/+server.js';

const cookies = { cms_session: 'alice' };
const event = (init: Parameters<typeof makeEvent>[0] = {}) =>
	makeEvent({ ...init, cookies: { ...cookies, ...(init.cookies ?? {}) } });

describe('GET /api/cms/release/history', () => {
	beforeEach(() => __resetStoreForTests());

	it('returns an empty list when no releases have been published', async () => {
		const body = (await expectJson(await historyGet(event()))) as { history: unknown[] };
		expect(body.history).toEqual([]);
	});

	it('returns published releases sorted desc by publishedAt', async () => {
		const publishOne = async (val: string, name: string) => {
			await itemsPost(
				event({
					method: 'POST',
					body: { items: [{ kind: 'layout', routeId: '/', fields: { x: val } }] }
				})
			);
			await publishPost(event({ method: 'POST', body: { name } }));
			// Tiny delay to ensure publishedAt differs (it's ISO ms-resolution).
			await new Promise((r) => setTimeout(r, 5));
		};

		await publishOne('1', 'first');
		await publishOne('2', 'second');
		await publishOne('3', 'third');

		const body = (await expectJson(await historyGet(event()))) as {
			history: Array<{ name?: string; publishedAt: string }>;
		};
		expect(body.history.map((h) => h.name)).toEqual(['third', 'second', 'first']);
		// Verify sort key.
		for (let i = 1; i < body.history.length; i++) {
			expect(body.history[i - 1].publishedAt >= body.history[i].publishedAt).toBe(true);
		}
	});
});
