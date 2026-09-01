/**
 * Password hashing on `node:crypto` alone — no dependency, native or otherwise.
 *
 * scrypt is memory-hard, which is what makes a stolen `cms_editors` table
 * expensive to attack offline. The parameters are stored alongside each hash so
 * they can be raised later without invalidating existing passwords: a verify
 * reads the cost the hash was written with, and a re-hash on next login is a
 * separate, additive change.
 *
 * The async form is used on the login path deliberately. `scryptSync` at these
 * parameters blocks the event loop for ~100ms, which on a shared server is a
 * denial-of-service vector against every other in-flight request.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export type ScryptParams = {
	/** CPU/memory cost. Must be a power of two. */
	N: number;
	/** Block size. */
	r: number;
	/** Parallelisation. */
	p: number;
};

/** OWASP's floor for scrypt at the time of writing. */
export const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };

const KEY_LENGTH = 64;

const derive = (password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		scrypt(
			password,
			salt,
			KEY_LENGTH,
			{
				N: params.N,
				r: params.r,
				p: params.p,
				// Node's default cap is 32 MB, which N=16384/r=8 exceeds.
				maxmem: 256 * 1024 * 1024
			},
			(err, key) => (err ? reject(err) : resolve(key))
		);
	});

/**
 * `scrypt$N$r$p$salt$hash`, salt and hash base64url. Self-describing, so
 * {@link verifyPassword} needs no configuration to read one back.
 */
export const hashPassword = async (
	password: string,
	params: ScryptParams = DEFAULT_PARAMS
): Promise<string> => {
	const salt = randomBytes(16);
	const key = await derive(password, salt, params);
	return [
		'scrypt',
		params.N,
		params.r,
		params.p,
		salt.toString('base64url'),
		key.toString('base64url')
	].join('$');
};

/**
 * Constant-time verify. Returns `false` rather than throwing for a malformed or
 * unrecognised hash, so a corrupt row denies access instead of 500ing.
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const N = Number(parts[1]);
	const r = Number(parts[2]);
	const p = Number(parts[3]);
	if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

	let salt: Buffer;
	let expected: Buffer;
	try {
		salt = Buffer.from(parts[4], 'base64url');
		expected = Buffer.from(parts[5], 'base64url');
	} catch {
		return false;
	}
	if (salt.length === 0 || expected.length === 0) return false;

	let actual: Buffer;
	try {
		actual = await derive(password, salt, { N, r, p });
	} catch {
		return false;
	}
	// timingSafeEqual throws on a length mismatch, which is itself public
	// information (it's in the stored hash), so comparing lengths first leaks
	// nothing.
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
};
