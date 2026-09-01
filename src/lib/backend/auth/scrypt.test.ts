import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, type ScryptParams } from './scrypt.js';

// Cheap parameters — these tests are about the encoding and the comparison,
// not about the work factor.
const FAST: ScryptParams = { N: 1024, r: 8, p: 1 };

describe('hashPassword', () => {
	it('produces a self-describing scrypt string', async () => {
		const hash = await hashPassword('correct horse', FAST);
		const [scheme, N, r, p, salt, key] = hash.split('$');
		expect(scheme).toBe('scrypt');
		expect([N, r, p]).toEqual(['1024', '8', '1']);
		expect(salt).not.toBe('');
		expect(key).not.toBe('');
	});

	it('salts, so the same password hashes differently every time', async () => {
		const a = await hashPassword('same', FAST);
		const b = await hashPassword('same', FAST);
		expect(a).not.toBe(b);
	});

	it('never contains the password', async () => {
		const hash = await hashPassword('hunter2', FAST);
		expect(hash).not.toContain('hunter2');
	});
});

describe('verifyPassword', () => {
	it('accepts the right password', async () => {
		const hash = await hashPassword('correct horse', FAST);
		await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
	});

	it('rejects the wrong password', async () => {
		const hash = await hashPassword('correct horse', FAST);
		await expect(verifyPassword('correct hors', hash)).resolves.toBe(false);
		await expect(verifyPassword('', hash)).resolves.toBe(false);
	});

	it('reads back the cost the hash was written with', async () => {
		// A hash written at different parameters still verifies — that is what
		// makes raising the work factor later a non-breaking change.
		const cheap = await hashPassword('pw', { N: 256, r: 8, p: 1 });
		const dearer = await hashPassword('pw', { N: 1024, r: 8, p: 1 });
		await expect(verifyPassword('pw', cheap)).resolves.toBe(true);
		await expect(verifyPassword('pw', dearer)).resolves.toBe(true);
	});

	it('returns false rather than throwing on a malformed hash', async () => {
		for (const bad of [
			'',
			'not-a-hash',
			'scrypt$1024$8$1$onlyfiveparts',
			'bcrypt$1024$8$1$c2FsdA$aGFzaA',
			'scrypt$notanumber$8$1$c2FsdA$aGFzaA',
			'scrypt$1024$8$1$$',
			'scrypt$1024$8$1$c2FsdA$'
		]) {
			await expect(verifyPassword('pw', bad)).resolves.toBe(false);
		}
	});

	it('rejects a hash of the right shape but the wrong key length', async () => {
		const hash = await hashPassword('pw', FAST);
		const parts = hash.split('$');
		parts[5] = Buffer.from('short').toString('base64url');
		await expect(verifyPassword('pw', parts.join('$'))).resolves.toBe(false);
	});
});
