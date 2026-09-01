import { beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend, type CmsBackend } from '../factory.js';
import { localEditors } from '../auth/local-editors.js';
import { createCmsTestClient, type CmsTestClient } from '../testing/harness.js';
import type { OpenRelease } from '../../core/wire.js';

/**
 * `POST /pages/rename` had no handler in any repository — the admin bar has
 * posted to it since it shipped and silently got a 404. These pin the
 * behaviour it should have had.
 */
const FAST = { N: 1024, r: 8, p: 1 };
const ROUTE = '/(marketing)/rooms/[slug]';

let backend: CmsBackend;
let editor: CmsTestClient;

const rename = (from: Record<string, string>, to: Record<string, string>, toUrl: string) =>
	editor.post('/pages/rename', {
		body: { routeId: ROUTE, locale: 'en', fromParams: from, toParams: to, toUrl }
	});

const items = (release: OpenRelease) =>
	release.items.map((i) => ({
		kind: i.kind,
		params: 'params' in i ? i.params : undefined,
		outcome: 'outcome' in i ? i.outcome : undefined
	}));

beforeEach(async () => {
	backend = createCmsBackend({
		dbPath: ':memory:',
		testReset: true,
		auth: localEditors({ scrypt: FAST }),
		resolveProject: () => 'p1'
	});
	const a = await backend.editors.create({
		email: 'a@example.com',
		password: 'pw',
		projects: ['p1']
	});
	const anon = createCmsTestClient(backend, { basePath: '/cms' });
	editor = anon.as(`cms_session=${backend.editors.createSession(a.id).token}`);
	await backend.testing.reset('p1', {
		pageDocs: {
			[ROUTE]: [{ params: { slug: 'suite-1' }, published: { hero: { title: 'Suite One' } } }]
		}
	});
});

describe('renaming a published page', () => {
	it('stages the new slug and redirects the old one', async () => {
		const res = await rename({ slug: 'suite-1' }, { slug: 'suite-a' }, '/rooms/suite-a');
		expect(res.status).toBe(200);

		const release = res.json<{ release: OpenRelease }>().release;
		expect(items(release)).toEqual(
			expect.arrayContaining([
				{ kind: 'page', params: { slug: 'suite-a' }, outcome: undefined },
				{
					kind: 'page-delete',
					params: { slug: 'suite-1' },
					outcome: { kind: 'redirect', to: '/rooms/suite-a' }
				}
			])
		);
	});

	it('carries the published content across to the new slug', async () => {
		await rename({ slug: 'suite-1' }, { slug: 'suite-a' }, '/rooms/suite-a');
		const release = (await editor.get('/release')).json<{ release: OpenRelease }>().release;
		const moved = release.items.find((i) => i.kind === 'page' && i.params.slug === 'suite-a');
		expect(moved && 'tree' in moved && moved.tree).toEqual({ hero: { title: 'Suite One' } });
	});

	it('serves the new slug and the redirect after publishing', async () => {
		await rename({ slug: 'suite-1' }, { slug: 'suite-a' }, '/rooms/suite-a');
		await editor.post('/release/publish', { body: {} });

		const moved = await editor.get(
			`/docs?kind=page&routeId=${encodeURIComponent(ROUTE)}&params=${encodeURIComponent(
				JSON.stringify({ slug: 'suite-a' })
			)}`
		);
		expect(moved.json<{ contents: { hero: { title: string } } }>().contents.hero.title).toBe(
			'Suite One'
		);

		const old = await editor.get(
			`/docs?kind=page&routeId=${encodeURIComponent(ROUTE)}&params=${encodeURIComponent(
				JSON.stringify({ slug: 'suite-1' })
			)}`
		);
		expect(old.json()).toEqual({ kind: 'redirect', to: '/rooms/suite-a' });
	});
});

describe('renaming a draft', () => {
	it('re-keys the item and stages no redirect', async () => {
		await editor.post('/pages', {
			body: { routeId: ROUTE, locale: 'en', params: { slug: 'draft-1' }, metadata: { title: 'D' } }
		});
		const res = await rename({ slug: 'draft-1' }, { slug: 'draft-2' }, '/rooms/draft-2');
		expect(res.status).toBe(200);

		const release = res.json<{ release: OpenRelease }>().release;
		const slugs = release.items
			.filter((i) => i.kind === 'page')
			.map((i) => (i.kind === 'page' ? i.params.slug : null));
		expect(slugs).toContain('draft-2');
		expect(slugs).not.toContain('draft-1');
		// Nothing was published at the old slug, so nothing to redirect from.
		expect(release.items.some((i) => i.kind === 'page-delete')).toBe(false);
	});
});

describe('rejections', () => {
	it('404s a page that neither exists nor is drafted', async () => {
		const res = await rename({ slug: 'ghost' }, { slug: 'other' }, '/rooms/other');
		expect(res.status).toBe(404);
	});

	it('409s when the destination is already published', async () => {
		await backend.testing.reset('p1', {
			pageDocs: {
				[ROUTE]: [
					{ params: { slug: 'suite-1' }, published: {} },
					{ params: { slug: 'suite-2' }, published: {} }
				]
			}
		});
		const res = await rename({ slug: 'suite-1' }, { slug: 'suite-2' }, '/rooms/suite-2');
		expect(res.status).toBe(409);
		expect(res.json()).toEqual({ error: 'page-exists' });
	});

	it('409s when another editor already drafted the destination', async () => {
		const other = await backend.editors.create({
			email: 'other@example.com',
			password: 'pw',
			projects: ['p1']
		});
		const otherClient = createCmsTestClient(backend, { basePath: '/cms' }).as(
			`cms_session=${backend.editors.createSession(other.id).token}`
		);
		await otherClient.post('/pages', {
			body: { routeId: ROUTE, locale: 'en', params: { slug: 'taken' } }
		});

		const res = await rename({ slug: 'suite-1' }, { slug: 'taken' }, '/rooms/taken');
		expect(res.status).toBe(409);
	});

	it('400s when the params are unchanged', async () => {
		const res = await rename({ slug: 'suite-1' }, { slug: 'suite-1' }, '/rooms/suite-1');
		expect(res.status).toBe(400);
	});

	it('400s on a missing field', async () => {
		const res = await editor.post('/pages/rename', {
			body: { routeId: ROUTE, locale: 'en', fromParams: { slug: 'a' }, toParams: { slug: 'b' } }
		});
		expect(res.status).toBe(400);
	});

	it('403s an anonymous caller', async () => {
		const anon = createCmsTestClient(backend, { basePath: '/cms' });
		const res = await anon.post('/pages/rename', {
			body: {
				routeId: ROUTE,
				locale: 'en',
				fromParams: { slug: 'suite-1' },
				toParams: { slug: 'x' },
				toUrl: '/rooms/x'
			}
		});
		expect(res.status).toBe(403);
	});
});
