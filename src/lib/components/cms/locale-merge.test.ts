import { describe, expect, it } from 'vitest';
import { mergeLocaleDocs, mergeLocaleEntries } from './locale-merge.js';
import type { CmsEntry } from './scope.ts';

describe('mergeLocaleDocs', () => {
	it('returns requested verbatim when fallback is null (single-locale fetch)', () => {
		const out = mergeLocaleDocs({ 'page:home': { title: 'Hello', body: 'world' } }, null);
		expect(out).toEqual({ 'page:home': { title: 'Hello', body: 'world' } });
	});

	it('omits scopes that are missing from both maps', () => {
		expect(mergeLocaleDocs({}, {})).toEqual({});
		expect(mergeLocaleDocs({}, null)).toEqual({});
	});

	it('returns fallback verbatim when requested is missing the scope', () => {
		const out = mergeLocaleDocs({}, { 'page:home': { title: 'Hola' } });
		expect(out).toEqual({ 'page:home': { title: 'Hola' } });
	});

	it('returns requested verbatim when fallback has the scope but requested also does and fallback is empty', () => {
		const out = mergeLocaleDocs({ 'page:home': { title: 'Hi' } }, {});
		expect(out).toEqual({ 'page:home': { title: 'Hi' } });
	});

	it('merges per scope: requested fields override fallback', () => {
		// Bug 2 fallback semantics: viewing `es`, missing fields fall back to `en`.
		const out = mergeLocaleDocs(
			{ 'page:home': { title: 'Hola' } },
			{ 'page:home': { title: 'Hello', body: 'World' } }
		);
		expect(out).toEqual({ 'page:home': { title: 'Hola', body: 'World' } });
	});

	it('deep-merges nested objects', () => {
		const out = mergeLocaleDocs(
			{ 'page:home': { metadata: { title: 'Hola' } } },
			{ 'page:home': { metadata: { title: 'Hello', description: 'En desc' } } }
		);
		expect(out).toEqual({
			'page:home': { metadata: { title: 'Hola', description: 'En desc' } }
		});
	});

	it('arrays from requested replace fallback arrays wholesale', () => {
		// `mergeTree`'s contract — arrays don't merge element-wise.
		const out = mergeLocaleDocs(
			{ 'page:home': { gallery: [{ id: 1 }] } },
			{ 'page:home': { gallery: [{ id: 1 }, { id: 2 }] } }
		);
		expect(out).toEqual({ 'page:home': { gallery: [{ id: 1 }] } });
	});

	it('handles disjoint scope sets in the two maps', () => {
		const out = mergeLocaleDocs(
			{ 'page:home': { title: 'Hola' } },
			{ 'page:about': { title: 'About' } }
		);
		expect(out).toEqual({
			'page:home': { title: 'Hola' },
			'page:about': { title: 'About' }
		});
	});
});

describe('mergeLocaleEntries', () => {
	const en = (params: Record<string, string>): CmsEntry => ({
		params,
		metadata: { lang: 'en' }
	});
	const es = (params: Record<string, string>): CmsEntry => ({
		params,
		metadata: { lang: 'es' }
	});

	it('returns a shallow clone of requested when fallback is null', () => {
		const out = mergeLocaleEntries({ '/posts/[slug]': [es({ slug: 'hola' })] }, null);
		expect(out).toEqual({ '/posts/[slug]': [es({ slug: 'hola' })] });
	});

	it('unions entries by stringified params; requested wins on metadata', () => {
		const out = mergeLocaleEntries(
			{ '/posts/[slug]': [es({ slug: 'shared' })] },
			{ '/posts/[slug]': [en({ slug: 'shared' })] }
		);
		expect(out['/posts/[slug]']).toEqual([es({ slug: 'shared' })]);
	});

	it('keeps fallback-only entries when requested is missing them', () => {
		// Editor created a post in `en` but hasn't translated to `es`.
		// Listing `es` should still surface the `en` entry as a fallback.
		const out = mergeLocaleEntries(
			{ '/posts/[slug]': [es({ slug: 'hola' })] },
			{ '/posts/[slug]': [en({ slug: 'hola' }), en({ slug: 'world' })] }
		);
		const slugs = out['/posts/[slug]'].map((e) => e.params.slug).sort();
		expect(slugs).toEqual(['hola', 'world']);
		// `hola` is the requested-locale version, `world` is the fallback-only one.
		const byslug = Object.fromEntries(out['/posts/[slug]'].map((e) => [e.params.slug, e]));
		expect(byslug.hola.metadata.lang).toBe('es');
		expect(byslug.world.metadata.lang).toBe('en');
	});

	it('handles disjoint routeIds', () => {
		const out = mergeLocaleEntries(
			{ '/posts/[slug]': [es({ slug: 'hola' })] },
			{ '/blog/[slug]': [en({ slug: 'hello' })] }
		);
		expect(Object.keys(out).sort()).toEqual(['/blog/[slug]', '/posts/[slug]']);
	});

	it('returns empty arrays for empty inputs', () => {
		expect(mergeLocaleEntries({}, {})).toEqual({});
		expect(mergeLocaleEntries({}, null)).toEqual({});
	});
});
