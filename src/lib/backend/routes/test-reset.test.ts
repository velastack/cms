import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestFixture, type TestFixture } from '../testing/fixtures.js';

/** Smallest valid PNG: a 1×1 transparent pixel. */
const PNG_1x1 = Buffer.from(
	'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100' +
		'0d0a2db40000000049454e44ae426082',
	'hex'
);

let fx: TestFixture;

beforeEach(async () => {
	fx = await createTestFixture();
});

/** Upload a PNG to `projectId` as Alice; returns the file's path on disk. */
const upload = async (projectId: string) => {
	const form = new FormData();
	form.set('file', new File([new Uint8Array(PNG_1x1)], 'a.png', { type: 'image/png' }), 'a.png');
	const res = await fx.at(projectId, fx.alice).post('/media', { formData: form });
	expect(res.status).toBe(201);
	const { url } = res.json<{ url: string }>();
	return join(fx.uploadDir, url.split('/').pop()!);
};

describe('test reset', () => {
	// Projects share one upload directory, so a reset that cleared the whole
	// directory deleted other projects' files, and test files resetting their own
	// projects in parallel broke each other's media.
	it("deletes only the reset project's uploads", async () => {
		const mine = await upload('p1');
		const theirs = await upload('p_alice');
		// a file no media row points at (eg. from an earlier run) is not the reset's to remove
		const stray = join(fx.uploadDir, '0123456789abcdef.png');
		writeFileSync(stray, PNG_1x1);

		await fx.backend.testing.reset('p1');

		expect(existsSync(mine)).toBe(false);
		expect(existsSync(theirs)).toBe(true);
		expect(existsSync(stray)).toBe(true);
		expect(fx.backend.store.listMediaItems('p_alice').total).toBe(1);
	});

	it('does the same over POST /__test_reset__', async () => {
		const mine = await upload('p1');
		const theirs = await upload('p_alice');

		expect((await fx.anon.post('/__test_reset__')).status).toBe(204);

		expect(existsSync(mine)).toBe(false);
		expect(existsSync(theirs)).toBe(true);
	});
});
