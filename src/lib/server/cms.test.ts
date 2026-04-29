import { describe, expect, it } from 'vitest';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { createCms } from './cms.js';
import { mockAdapter } from './mock-adapter.js';

// The vitest server project aliases `virtual:vela-cms/manifest` to a stable
// fixture. Route ids in these tests must exist there. See
// `src/routes/api/cms/__tests__/__fixtures__/test-manifest.ts`.

const fakeEvent = (overrides: Partial<{
	routeId: string | null;
	params: Record<string, string>;
	previewKey: string | null;
}>): ServerLoadEvent => {
	const url = new URL('http://localhost/');
	if (overrides.previewKey) url.searchParams.set('preview', overrides.previewKey);
	return {
		route: { id: overrides.routeId ?? null },
		params: overrides.params ?? {},
		url,
		fetch: globalThis.fetch
		// Other ServerLoadEvent fields are unused by loadCms.
	} as unknown as ServerLoadEvent;
};

describe('createCms.load', () => {
	it('binds adapter + locale and returns a populated payload', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/': [{ params: {}, published: { 'welcome.title': 'Hi' } }]
			}
		});
		const cms = createCms({ adapter, locale: 'en' });
		const { cms: payload, notFound } = await cms.load(fakeEvent({ routeId: '/' }));
		expect(notFound).toBe(false);
		expect(payload.locale).toBe('en');
		expect(payload.docs['page:/']).toEqual({ 'welcome.title': 'Hi' });
	});

	it('returns notFound for a parameterized route with no doc', async () => {
		const adapter = mockAdapter({});
		const cms = createCms({ adapter, locale: 'en' });
		const result = await cms.load(
			fakeEvent({ routeId: '/(marketing)/rooms/[slug]', params: { slug: 'missing' } })
		);
		expect(result.notFound).toBe(true);
	});
});

describe('createCms.generateEntries', () => {
	it('returns the adapter\'s entries for a given route id', async () => {
		const adapter = mockAdapter({
			pageDocs: {
				'/(marketing)/rooms/[slug]': [
					{ params: { slug: 'a' }, published: { _metadata: { title: 'A' } } },
					{ params: { slug: 'b' }, published: { _metadata: { title: 'B' } } }
				]
			}
		});
		const cms = createCms({ adapter, locale: 'en' });
		const entries = await cms.generateEntries('/(marketing)/rooms/[slug]');
		expect(entries.map((e) => e.params.slug).sort()).toEqual(['a', 'b']);
		expect(entries.find((e) => e.params.slug === 'a')?.metadata).toEqual({ title: 'A' });
	});

	it('throws when no routeId is supplied (Vite plugin not running)', async () => {
		const cms = createCms({ adapter: mockAdapter({}), locale: 'en' });
		await expect(cms.generateEntries()).rejects.toThrow(/Vite plugin/);
	});
});
