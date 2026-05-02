import { describe, expect, it } from 'vitest';
import { diffPaths, get, has, mergeTree, parsePath, set, unset } from './path.ts';

describe('parsePath', () => {
	it('splits dotted paths', () => {
		expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
	});
	it('treats numeric segments as strings', () => {
		expect(parsePath('gallery.0.caption')).toEqual(['gallery', '0', 'caption']);
	});
	it('returns [] for empty string', () => {
		expect(parsePath('')).toEqual([]);
	});
});

describe('get', () => {
	it('walks nested objects', () => {
		expect(get({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
	});
	it('walks arrays via numeric segments', () => {
		expect(get({ list: [{ x: 1 }, { x: 2 }] }, 'list.1.x')).toBe(2);
	});
	it('returns undefined on missing parents', () => {
		expect(get({ a: 1 }, 'a.b.c')).toBeUndefined();
		expect(get({}, 'x')).toBeUndefined();
	});
	it('returns the tree itself for empty path', () => {
		const t = { a: 1 };
		expect(get(t, '')).toBe(t);
	});
	it('returns undefined when tree is null/undefined', () => {
		expect(get(undefined, 'a')).toBeUndefined();
		expect(get(null, 'a')).toBeUndefined();
	});
});

describe('has', () => {
	it('detects present leaves', () => {
		expect(has({ a: { b: 1 } }, 'a.b')).toBe(true);
	});
	it('detects explicit undefined leaves', () => {
		expect(has({ a: { b: undefined } }, 'a.b')).toBe(true);
	});
	it('returns false for missing parents', () => {
		expect(has({}, 'a.b')).toBe(false);
		expect(has({ a: 1 }, 'a.b')).toBe(false);
	});
	it('returns false on undefined tree', () => {
		expect(has(undefined, 'a')).toBe(false);
	});
});

describe('set', () => {
	it('writes a leaf', () => {
		const t: Record<string, unknown> = {};
		set(t, 'a.b.c', 1);
		expect(t).toEqual({ a: { b: { c: 1 } } });
	});
	it('creates arrays for numeric next segments', () => {
		const t: Record<string, unknown> = {};
		set(t, 'gallery.0.caption', 'hi');
		expect(t).toEqual({ gallery: [{ caption: 'hi' }] });
		expect(Array.isArray((t as { gallery: unknown }).gallery)).toBe(true);
	});
	it('creates objects for non-numeric next segments', () => {
		const t: Record<string, unknown> = {};
		set(t, 'a.b', 1);
		expect(t).toEqual({ a: { b: 1 } });
	});
	it('overwrites a parent when set deeper', () => {
		const t: Record<string, unknown> = { a: 1 };
		set(t, 'a.b', 2);
		expect(t).toEqual({ a: { b: 2 } });
	});
	it('overwrites children when set shallower', () => {
		const t: Record<string, unknown> = { a: { b: 1, c: 2 } };
		set(t, 'a', { d: 3 });
		expect(t).toEqual({ a: { d: 3 } });
	});
	it('respects the last-write-wins rule', () => {
		const t: Record<string, unknown> = {};
		set(t, 'a', { b: 1 });
		set(t, 'a.b', 2);
		expect(t).toEqual({ a: { b: 2 } });
	});
	it('throws on empty path', () => {
		expect(() => set({}, '', 1)).toThrow();
	});
});

describe('unset', () => {
	it('deletes a leaf', () => {
		const t: Record<string, unknown> = { a: { b: 1, c: 2 } };
		expect(unset(t, 'a.b')).toBe(true);
		expect(t).toEqual({ a: { c: 2 } });
	});
	it('returns false for missing leaves', () => {
		expect(unset({ a: 1 }, 'a.b')).toBe(false);
		expect(unset({}, 'a')).toBe(false);
	});
	it('does not collapse empty parent objects', () => {
		const t: Record<string, unknown> = { a: { b: 1 } };
		unset(t, 'a.b');
		expect(t).toEqual({ a: {} });
	});
});

describe('mergeTree', () => {
	it('deep-merges plain objects', () => {
		expect(mergeTree({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
	});
	it('replaces arrays wholesale', () => {
		expect(mergeTree({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
	});
	it('replaces primitives', () => {
		expect(mergeTree({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
	});
	it('replaces objects when overlay is non-object', () => {
		expect(mergeTree({ a: { b: 1 } }, { a: 'hi' })).toEqual({ a: 'hi' });
	});
	it('replaces non-objects when overlay is object', () => {
		expect(mergeTree({ a: 'hi' }, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
	});
	it('skips undefined trees', () => {
		expect(mergeTree(undefined, { a: 1 }, undefined)).toEqual({ a: 1 });
	});
	it('handles three layers (base + overlay + draft)', () => {
		const base = { welcome: { title: 'Old', body: 'Body' } };
		const overlay = { welcome: { title: 'Mid' } };
		const draft = { welcome: { title: 'New' } };
		expect(mergeTree(base, overlay, draft)).toEqual({
			welcome: { title: 'New', body: 'Body' }
		});
	});
});

describe('diffPaths', () => {
	it('returns [] for identical trees', () => {
		expect(diffPaths({ a: 1 }, { a: 1 })).toEqual([]);
	});
	it('returns leaf paths that differ', () => {
		expect(diffPaths({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
	});
	it('walks nested structures', () => {
		expect(diffPaths({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } })).toEqual(['a.c']);
	});
	it('emits added/removed leaves as paths', () => {
		expect(diffPaths({}, { a: 1, b: { c: 2 } }).sort()).toEqual(['a', 'b.c']);
		expect(diffPaths({ a: 1, b: { c: 2 } }, {}).sort()).toEqual(['a', 'b.c']);
	});
	it('walks equal-length arrays per index', () => {
		expect(diffPaths({ list: [1, 2, 3] }, { list: [1, 9, 3] })).toEqual(['list.1']);
	});
	it('emits the array path itself when lengths differ', () => {
		expect(diffPaths({ list: [1, 2] }, { list: [1, 2, 3] })).toEqual(['list']);
	});
	it('produces sorted output', () => {
		const before = { z: 1, a: 1, m: 1 };
		const after = { z: 2, a: 2, m: 2 };
		expect(diffPaths(before, after)).toEqual(['a', 'm', 'z']);
	});
	it('treats undefined as empty tree at root', () => {
		expect(diffPaths(undefined, { a: 1 })).toEqual(['a']);
		expect(diffPaths({ a: 1 }, undefined)).toEqual(['a']);
	});
});
