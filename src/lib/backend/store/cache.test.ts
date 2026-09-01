import { describe, expect, it, vi, afterEach } from 'vitest';
import { createReadCache } from './cache.js';

const key = (scope: string, cmsVersion = 1, projectId = 'p1') => ({ projectId, cmsVersion, scope });

describe('createReadCache', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('round-trips a value', () => {
		const cache = createReadCache();
		cache.set(key('docs'), 'body');
		expect(cache.get(key('docs'))).toBe('body');
	});

	it('partitions by project, cms version, and scope', () => {
		const cache = createReadCache();
		cache.set(key('docs', 1, 'p1'), 'a');
		expect(cache.get(key('docs', 1, 'p2'))).toBeUndefined();
		expect(cache.get(key('docs', 2, 'p1'))).toBeUndefined();
		expect(cache.get(key('site', 1, 'p1'))).toBeUndefined();
	});

	it('makes every entry unreachable when the cms version bumps', () => {
		// This is why publish does not need to actively evict.
		const cache = createReadCache();
		cache.set(key('docs', 7), 'old');
		expect(cache.get(key('docs', 8))).toBeUndefined();
	});

	it('evicts the least recently used entry past max', () => {
		const cache = createReadCache({ max: 2 });
		cache.set(key('a'), '1');
		cache.set(key('b'), '2');
		cache.get(key('a')); // refresh a, so b is now the oldest
		cache.set(key('c'), '3');
		expect(cache.get(key('a'))).toBe('1');
		expect(cache.get(key('b'))).toBeUndefined();
		expect(cache.get(key('c'))).toBe('3');
	});

	it('expires entries after the ttl', () => {
		vi.useFakeTimers();
		const cache = createReadCache({ ttlMs: 1000 });
		cache.set(key('docs'), 'body');
		vi.advanceTimersByTime(999);
		expect(cache.get(key('docs'))).toBe('body');
		vi.advanceTimersByTime(2);
		expect(cache.get(key('docs'))).toBeUndefined();
	});

	it('overwrites in place without growing', () => {
		const cache = createReadCache({ max: 1 });
		cache.set(key('docs'), 'one');
		cache.set(key('docs'), 'two');
		expect(cache.get(key('docs'))).toBe('two');
	});

	it('clears everything', () => {
		const cache = createReadCache();
		cache.set(key('docs'), 'body');
		cache.clear();
		expect(cache.get(key('docs'))).toBeUndefined();
	});
});
