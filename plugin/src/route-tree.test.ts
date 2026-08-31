import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ancestorRouteIds, discoverRoutes, extractRouteParams } from './route-tree.js';

describe('ancestorRouteIds', () => {
	it('returns just root for `/`', () => {
		expect(ancestorRouteIds('/')).toEqual(['/']);
	});

	it('walks a single segment', () => {
		expect(ancestorRouteIds('/about')).toEqual(['/', '/about']);
	});

	it('walks through SvelteKit route groups', () => {
		expect(ancestorRouteIds('/(marketing)/about')).toEqual([
			'/',
			'/(marketing)',
			'/(marketing)/about'
		]);
	});

	it('walks through dynamic params', () => {
		expect(ancestorRouteIds('/(marketing)/rooms/[slug]')).toEqual([
			'/',
			'/(marketing)',
			'/(marketing)/rooms',
			'/(marketing)/rooms/[slug]'
		]);
	});
});

describe('extractRouteParams', () => {
	it('returns [] when no params', () => {
		expect(extractRouteParams('/(marketing)/about')).toEqual([]);
	});

	it('extracts a single named param', () => {
		expect(extractRouteParams('/(marketing)/rooms/[slug]')).toEqual(['slug']);
	});

	it('extracts a rest param without the dots', () => {
		expect(extractRouteParams('/blog/[...path]')).toEqual(['path']);
	});

	it('extracts multiple params in order', () => {
		expect(extractRouteParams('/[locale]/posts/[id]')).toEqual(['locale', 'id']);
	});

	it('ignores route groups in parentheses', () => {
		expect(extractRouteParams('/(marketing)/(public)/[slug]')).toEqual(['slug']);
	});
});

describe('discoverRoutes', () => {
	const setupFixture = () => {
		const dir = mkdtempSync(join(tmpdir(), 'velacms-routes-'));
		mkdirSync(join(dir, '(marketing)', 'rooms', '[slug]'), { recursive: true });
		mkdirSync(join(dir, 'about'));
		writeFileSync(join(dir, '+layout.svelte'), '<slot />');
		writeFileSync(join(dir, '+page.svelte'), '<h1>home</h1>');
		writeFileSync(join(dir, 'about', '+page.svelte'), '<h1>about</h1>');
		writeFileSync(join(dir, '(marketing)', '+layout.svelte'), '<slot />');
		writeFileSync(join(dir, '(marketing)', 'rooms', '[slug]', '+page.svelte'), '<h1>room</h1>');
		writeFileSync(
			join(dir, '(marketing)', 'rooms', '[slug]', '+page.ts'),
			'export const load = () => ({});'
		);
		writeFileSync(join(dir, '(marketing)', 'rooms', '[slug]', 'page.cms.ts'), 'export default {};');
		return dir;
	};

	it('returns [] when routesDir does not exist', () => {
		expect(discoverRoutes('/this/path/does/not/exist/velacms')).toEqual([]);
	});

	it('walks every directory and reports per-route file presence', () => {
		const dir = setupFixture();
		try {
			const nodes = discoverRoutes(dir);
			const byId = new Map(nodes.map((n) => [n.routeId, n]));

			expect(byId.get('/')?.layoutPath).toContain('+layout.svelte');
			expect(byId.get('/')?.pagePath).toContain('+page.svelte');
			expect(byId.get('/')?.pageScriptPath).toBeNull();

			expect(byId.get('/about')?.pagePath).toContain('about/+page.svelte');
			expect(byId.get('/about')?.layoutPath).toBeNull();

			expect(byId.get('/(marketing)')?.layoutPath).toContain('(marketing)/+layout.svelte');
			expect(byId.get('/(marketing)')?.pagePath).toBeNull();

			const room = byId.get('/(marketing)/rooms/[slug]');
			expect(room?.pagePath).toContain('[slug]/+page.svelte');
			expect(room?.pageScriptPath).toContain('[slug]/+page.ts');
			expect(room?.pageCmsPath).toContain('[slug]/page.cms.ts');
			expect(room?.pageServerScriptPath).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('skips entries starting with `+` or `.` when recursing', () => {
		const dir = mkdtempSync(join(tmpdir(), 'velacms-routes-'));
		try {
			mkdirSync(join(dir, '+special'));
			mkdirSync(join(dir, '.hidden'));
			mkdirSync(join(dir, 'about'));
			writeFileSync(join(dir, 'about', '+page.svelte'), '<h1>about</h1>');
			writeFileSync(join(dir, '+special', '+page.svelte'), '<h1>nope</h1>');
			writeFileSync(join(dir, '.hidden', '+page.svelte'), '<h1>nope</h1>');

			const nodes = discoverRoutes(dir);
			const ids = nodes.map((n) => n.routeId);
			expect(ids).toContain('/');
			expect(ids).toContain('/about');
			expect(ids).not.toContain('/+special');
			expect(ids).not.toContain('/.hidden');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
