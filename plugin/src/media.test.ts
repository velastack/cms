import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveUploadsBase, downloadMedia, extractMediaUrls, rewriteMediaUrls } from './media.js';

describe('deriveUploadsBase', () => {
	it('uses the endpoint origin (not the project path)', () => {
		expect(deriveUploadsBase('https://cms.example.com/v1/projects/p1/cms')).toBe(
			'https://cms.example.com/uploads'
		);
	});

	it('handles localhost dev endpoints with ports', () => {
		expect(deriveUploadsBase('http://localhost:5174/v1/projects/p1/cms')).toBe(
			'http://localhost:5174/uploads'
		);
	});
});

describe('extractMediaUrls', () => {
	const base = 'https://cms.example.com/uploads';

	it('finds relative /uploads/* paths anywhere in the tree', () => {
		const tree = {
			hero: { image: { url: '/uploads/abc.png' } },
			gallery: [{ src: '/uploads/one.jpg' }, { src: '/uploads/two.jpg' }],
			body: 'plain text — not a url'
		};
		expect([...extractMediaUrls(tree, base)].sort()).toEqual(['abc.png', 'one.jpg', 'two.jpg']);
	});

	it('finds absolute URLs whose origin matches uploadsBase', () => {
		const tree = {
			a: 'https://cms.example.com/uploads/abs.png',
			b: 'https://other.example/uploads/skip.png',
			c: '/uploads/rel.png'
		};
		expect([...extractMediaUrls(tree, base)].sort()).toEqual(['abs.png', 'rel.png']);
	});

	it('strips query strings and fragments from absolute URLs', () => {
		const tree = { a: 'https://cms.example.com/uploads/q.png?v=1#frag' };
		expect([...extractMediaUrls(tree, base)]).toEqual(['q.png']);
	});

	it('does not match deeply-nested upload-like paths (sub-directories)', () => {
		const tree = { a: '/uploads/foo/bar.png', b: 'https://cms.example.com/uploads/foo/bar.png' };
		expect([...extractMediaUrls(tree, base)]).toEqual([]);
	});

	it('handles cycles without infinite loop', () => {
		type Node = { x: string; child?: Node };
		const a: Node = { x: '/uploads/cycle.png' };
		a.child = a;
		expect([...extractMediaUrls(a, base)]).toEqual(['cycle.png']);
	});

	it('returns empty for primitives, null, undefined', () => {
		expect([...extractMediaUrls(null, base)]).toEqual([]);
		expect([...extractMediaUrls(undefined, base)]).toEqual([]);
		expect([...extractMediaUrls(42, base)]).toEqual([]);
		expect([...extractMediaUrls('plain', base)]).toEqual([]);
	});
});

describe('rewriteMediaUrls', () => {
	const base = 'https://cms.example.com/uploads';

	it('rewrites relative paths and preserves the rest', () => {
		const tree = {
			hero: { image: { url: '/uploads/abc.png' }, title: 'Welcome' },
			n: 42
		};
		const out = rewriteMediaUrls(tree, base, '/cms-media');
		expect(out).toEqual({
			hero: { image: { url: '/cms-media/abc.png' }, title: 'Welcome' },
			n: 42
		});
	});

	it('rewrites absolute URLs at the configured uploadsBase, leaves foreign URLs alone', () => {
		const tree = {
			a: 'https://cms.example.com/uploads/abs.png',
			b: 'https://other.example/uploads/skip.png'
		};
		expect(rewriteMediaUrls(tree, base, '/cms-media')).toEqual({
			a: '/cms-media/abs.png',
			b: 'https://other.example/uploads/skip.png'
		});
	});

	it('does not mutate the input', () => {
		const tree = { url: '/uploads/abc.png' };
		const out = rewriteMediaUrls(tree, base, '/cms-media');
		expect(tree.url).toBe('/uploads/abc.png');
		expect(out).not.toBe(tree);
	});

	it('strips trailing slash on mediaPrefix', () => {
		const out = rewriteMediaUrls({ x: '/uploads/x.png' }, base, '/cms-media/');
		expect(out).toEqual({ x: '/cms-media/x.png' });
	});

	it('preserves arrays', () => {
		const out = rewriteMediaUrls(
			[{ src: '/uploads/a.png' }, { src: '/uploads/b.png' }],
			base,
			'/cms-media'
		);
		expect(out).toEqual([{ src: '/cms-media/a.png' }, { src: '/cms-media/b.png' }]);
	});
});

describe('downloadMedia', () => {
	let tmpDir: string;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'velastack-media-'));
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('writes new files and skips existing ones', async () => {
		const calls: string[] = [];
		globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
			calls.push(String(url));
			return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		}) as typeof fetch;

		fs.writeFileSync(path.join(tmpDir, 'existing.png'), 'old');

		const result = await downloadMedia(
			['existing.png', 'new.png'],
			'https://cms.example.com/uploads',
			tmpDir
		);

		expect(result.written).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.failed).toEqual([]);
		expect(fs.existsSync(path.join(tmpDir, 'new.png'))).toBe(true);
		expect(fs.readFileSync(path.join(tmpDir, 'existing.png'), 'utf-8')).toBe('old');
		expect(calls).toEqual(['https://cms.example.com/uploads/new.png']);
	});

	it('records failures without throwing', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response('not found', { status: 404 })
		) as typeof fetch;

		const result = await downloadMedia(['missing.png'], 'https://cms.example.com/uploads', tmpDir);

		expect(result.written).toBe(0);
		expect(result.failed).toEqual([{ filename: 'missing.png', reason: 'HTTP 404' }]);
	});

	it('deduplicates filenames', async () => {
		const calls: string[] = [];
		globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
			calls.push(String(url));
			return new Response(new Uint8Array([1]), { status: 200 });
		}) as typeof fetch;

		await downloadMedia(['a.png', 'a.png', 'a.png'], 'https://cms.example.com/uploads', tmpDir);
		expect(calls).toHaveLength(1);
	});

	it('is a no-op for an empty list', async () => {
		globalThis.fetch = vi.fn() as typeof fetch;
		const result = await downloadMedia([], 'https://cms.example.com/uploads', tmpDir);
		expect(result).toEqual({ written: 0, skipped: 0, failed: [] });
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});
