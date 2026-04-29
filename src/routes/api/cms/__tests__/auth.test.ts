import { beforeEach, describe, expect, it } from 'vitest';
import { makeEvent } from './helpers.js';
import { __resetStoreForTests } from '../_store.js';
import { GET as userGet } from '../user/+server.js';
import { GET as releaseGet } from '../release/+server.js';
import { POST as discardPost } from '../release/discard/+server.js';
import { POST as previewKeyPost } from '../release/preview-key/+server.js';
import { POST as publishPost } from '../release/publish/+server.js';
import { GET as historyGet } from '../release/history/+server.js';
import { POST as revertPost } from '../release/history/[id]/revert/+server.js';
import { POST as itemsPost, DELETE as itemsDelete } from '../release/items/+server.js';
import { GET as pagesGet, POST as pagesPost, DELETE as pagesDelete } from '../pages/+server.js';

describe('every protected route returns 403 without a `cms_session` cookie', () => {
	beforeEach(() => __resetStoreForTests());

	const cases: Array<[string, () => Promise<Response>]> = [
		['GET /api/cms/user', () => userGet(makeEvent()) as Promise<Response>],
		['GET /api/cms/release', () => releaseGet(makeEvent()) as Promise<Response>],
		[
			'POST /api/cms/release/discard',
			() => discardPost(makeEvent({ method: 'POST' })) as Promise<Response>
		],
		[
			'POST /api/cms/release/preview-key',
			() => previewKeyPost(makeEvent({ method: 'POST' })) as Promise<Response>
		],
		[
			'POST /api/cms/release/publish',
			() => publishPost(makeEvent({ method: 'POST' })) as Promise<Response>
		],
		['GET /api/cms/release/history', () => historyGet(makeEvent()) as Promise<Response>],
		[
			'POST /api/cms/release/history/[id]/revert',
			() =>
				revertPost(
					makeEvent({ method: 'POST', params: { id: 'whatever' } })
				) as Promise<Response>
		],
		[
			'POST /api/cms/release/items',
			() => itemsPost(makeEvent({ method: 'POST', body: { items: [] } })) as Promise<Response>
		],
		[
			'DELETE /api/cms/release/items',
			() =>
				itemsDelete(
					makeEvent({ method: 'DELETE', body: { kind: 'layout', routeId: '/' } })
				) as Promise<Response>
		],
		['GET /api/cms/pages', () => pagesGet(makeEvent()) as Promise<Response>],
		[
			'POST /api/cms/pages',
			() =>
				pagesPost(
					makeEvent({ method: 'POST', body: { routeId: '/', params: {} } })
				) as Promise<Response>
		],
		[
			'DELETE /api/cms/pages',
			() =>
				pagesDelete(
					makeEvent({ method: 'DELETE', body: { routeId: '/', params: {} } })
				) as Promise<Response>
		]
	];

	for (const [label, run] of cases) {
		it(`${label} → 403 unauthed`, async () => {
			const response = await run();
			expect(response.status).toBe(403);
		});
	}
});
