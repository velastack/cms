import { describe, expect, it } from 'vitest';
// @ts-expect-error — JS module; types come from JSDoc
import { buildParamExtractor, parseRouteSegments } from './adapter.js';

describe('parseRouteSegments', () => {
	it('strips route groups and emits typed segments', () => {
		expect(parseRouteSegments('/(marketing)/rooms/[slug]')).toEqual([
			{ kind: 'static', value: 'rooms' },
			{ kind: 'dynamic', name: 'slug' }
		]);
	});

	it('handles rest params', () => {
		expect(parseRouteSegments('/blog/[...path]')).toEqual([
			{ kind: 'static', value: 'blog' },
			{ kind: 'rest', name: 'path' }
		]);
	});

	it('handles optional params', () => {
		expect(parseRouteSegments('/[[locale]]/about')).toEqual([
			{ kind: 'optional', name: 'locale' },
			{ kind: 'static', value: 'about' }
		]);
	});

	it('flags matchers as unsupported', () => {
		const segs = parseRouteSegments('/[slug=type]');
		expect(segs).toEqual([{ kind: 'unsupported' }]);
	});

	it('flags mixed-bracket segments as unsupported', () => {
		const segs = parseRouteSegments('/prefix-[id]');
		expect(segs).toEqual([{ kind: 'unsupported' }]);
	});

	it('returns an empty list for the root route', () => {
		expect(parseRouteSegments('/')).toEqual([]);
	});
});

describe('buildParamExtractor', () => {
	it('extracts a single dynamic param', () => {
		const ex = buildParamExtractor(parseRouteSegments('/(marketing)/rooms/[slug]'));
		expect(ex).not.toBeNull();
		expect(ex!('/rooms/suite-1')).toEqual({ slug: 'suite-1' });
		expect(ex!('/rooms/suite-2')).toEqual({ slug: 'suite-2' });
	});

	it('rejects URLs whose static segments differ', () => {
		const ex = buildParamExtractor(parseRouteSegments('/rooms/[slug]'))!;
		expect(ex('/lounges/suite-1')).toBeNull();
	});

	it('rejects URLs with extra segments', () => {
		const ex = buildParamExtractor(parseRouteSegments('/rooms/[slug]'))!;
		expect(ex('/rooms/suite-1/extra')).toBeNull();
	});

	it('rejects URLs with too few segments for required dynamic', () => {
		const ex = buildParamExtractor(parseRouteSegments('/rooms/[slug]'))!;
		expect(ex('/rooms')).toBeNull();
	});

	it('extracts rest params as `/`-joined strings', () => {
		const ex = buildParamExtractor(parseRouteSegments('/blog/[...path]'))!;
		expect(ex('/blog/2026/04/article')).toEqual({ path: '2026/04/article' });
		expect(ex('/blog/single')).toEqual({ path: 'single' });
	});

	it('handles optional params bound and unbound', () => {
		const ex = buildParamExtractor(parseRouteSegments('/[[locale]]/about'))!;
		expect(ex('/en/about')).toEqual({ locale: 'en' });
		// When the optional precedes a static, an unbound optional means the
		// static lines up at index 0 — but `/about` shape isn't unambiguous
		// from this extractor alone. SvelteKit's router decides; this
		// extractor reports `null` when static doesn't line up.
		expect(ex('/about')).toBeNull();
	});

	it('returns null when segments include an unsupported marker', () => {
		const ex = buildParamExtractor(parseRouteSegments('/[slug=type]'));
		expect(ex).toBeNull();
	});

	it('handles multiple dynamic params', () => {
		const ex = buildParamExtractor(parseRouteSegments('/[category]/[slug]'))!;
		expect(ex('/rooms/suite-1')).toEqual({ category: 'rooms', slug: 'suite-1' });
	});
});
