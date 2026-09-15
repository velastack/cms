import { describe, expect, it } from 'vitest';
import { formatRelative } from './format-relative.ts';

const now = Date.parse('2026-09-14T15:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('formatRelative', () => {
	it('says "just now" under 45 seconds', () => {
		expect(formatRelative(ago(30_000), now)).toBe('just now');
	});
	it('counts minutes', () => {
		expect(formatRelative(ago(60_000), now)).toBe('1 minute ago');
		expect(formatRelative(ago(5 * 60_000), now)).toBe('5 minutes ago');
	});
	it('is empty for an unparseable timestamp', () => {
		expect(formatRelative('nope', now)).toBe('');
	});
});
