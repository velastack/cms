import { describe, expect, it } from 'vitest';
import { checkContent, fallbackResolverFor, injectFallbacks, scanUsages } from './build.js';

const SRC = `<script lang="ts">
	import { CmsText, CmsBoolean, CmsHours } from '@velastack/cms';
	import Hero from '$lib/components/cms/Hero.svelte';
	import Card from './Card.svelte';
	let dyn = 'x';
</script>

<h1><CmsText name="hero.title" /></h1>
<CmsText name="branding.name" scope="root" />
<CmsBoolean name="hero.showCta" />
<CmsHours name="hours" scope="root" fallback={{ v: 1 }} />
<Hero name="hero.block" />
<Card name="not-cms" />
<CmsText name={dyn} />
<CmsText name="item.label" value={dyn} />
`;

describe('scanUsages', () => {
	it('classifies package and in-tree imports, ignores everything else', () => {
		const { usages, warnings } = scanUsages(SRC, { filename: 'x.svelte' });
		expect(usages.map((u) => [u.name, u.component, u.scope, u.dynamic, u.hasValue])).toEqual([
			['hero.title', 'CmsText', null, false, false],
			['branding.name', 'CmsText', 'layout:/', false, false],
			['hero.showCta', 'CmsBoolean', null, false, false],
			['hours', 'CmsHours', 'layout:/', false, false],
			['hero.block', 'Hero', null, false, false],
			[null, 'CmsText', null, true, false],
			['item.label', 'CmsText', null, false, true]
		]);
		expect(warnings).toEqual(['x.svelte:14 <CmsText> has a dynamic name']);
	});

	it('accepts extra component names', () => {
		const { usages } = scanUsages(SRC, { components: ['Card'] });
		expect(usages.some((u) => u.component === 'Card' && u.name === 'not-cms')).toBe(true);
	});

	it('recognizes the in-tree components through `#lib` subpath imports', () => {
		const src = `<script lang="ts">
	import { CmsText } from '#lib/components/cms/index.js';
	import { CmsImage } from '#lib/components/cms';
	import Hero from '#lib/components/cms/Hero.svelte';
	import Other from '#lib/components/other/Other.svelte';
</script>

<CmsText name="a" />
<CmsImage name="b" />
<Hero name="c" />
<Other name="d" />
`;
		const { usages } = scanUsages(src);
		expect(usages.map((u) => [u.name, u.component])).toEqual([
			['a', 'CmsText'],
			['b', 'CmsImage'],
			['c', 'Hero']
		]);
	});
});

describe('injectFallbacks', () => {
	it('injects JSON fallbacks after the name prop, using `initial` for CmsBoolean', () => {
		const { code, injected, missing } = injectFallbacks(SRC, {
			hero: { title: 'Welcome "home"', showCta: true, block: { v: 1, items: [] } }
		});
		expect(code).toContain('<CmsText name="hero.title" fallback={"Welcome \\"home\\""} />');
		expect(code).toContain('<CmsBoolean name="hero.showCta" initial={true} />');
		expect(code).toContain('<Hero name="hero.block" fallback={{"v":1,"items":[]}} />');
		// Existing fallback kept, dynamic and value= usages untouched.
		expect(code).toContain('<CmsHours name="hours" scope="root" fallback={{ v: 1 }} />');
		expect(code).toContain('<CmsText name={dyn} />');
		expect(code).toContain('<CmsText name="item.label" value={dyn} />');
		expect(injected).toEqual(['hero.title', 'hero.showCta', 'hero.block']);
		expect(missing).toEqual(['branding.name']);
	});

	it('replaces an existing fallback when overwrite is set', () => {
		const { code } = injectFallbacks(SRC, { hours: { v: 2 } }, { overwrite: true });
		expect(code).toContain('<CmsHours name="hours" scope="root" fallback={{"v":2}} />');
		expect(code).not.toContain('fallback={{ v: 1 }}');
	});

	describe('an existing `initial` on CmsBoolean', () => {
		const withInitial = (attr: string) =>
			`<script>import { CmsBoolean } from '@velastack/cms';</script>\n` +
			`<CmsBoolean name="hero.showCta" ${attr} label="CTA" />`;

		it.each([
			['shorthand', 'initial'],
			['curly shorthand', '{initial}'],
			['expression', 'initial={false}'],
			['quoted', 'initial="false"']
		])('replaces the %s form under overwrite instead of adding a second', (_, attr) => {
			const { code, injected } = injectFallbacks(
				withInitial(attr),
				{ hero: { showCta: true } },
				{ overwrite: true }
			);
			expect(code).toContain('<CmsBoolean name="hero.showCta" initial={true} label="CTA" />');
			expect(code.match(/initial/g)).toHaveLength(1);
			expect(injected).toEqual(['hero.showCta']);
		});

		it('leaves the shorthand form alone without overwrite', () => {
			const src = withInitial('initial');
			const { code, injected } = injectFallbacks(src, { hero: { showCta: true } });
			expect(code).toBe(src);
			expect(injected).toEqual([]);
		});
	});

	it("uses the manifest's classification when given one, for imports it cannot read", () => {
		const src = `<script>import { CmsText } from '#lib/index.js';</script><CmsText name="hero.title" />`;
		const content = { hero: { title: 'Hi' } };
		expect(injectFallbacks(src, content).injected).toEqual([]);
		const { code } = injectFallbacks(src, content, { locals: new Map([['CmsText', 'CmsText']]) });
		expect(code).toContain('name="hero.title" fallback={"Hi"}');
	});

	it('leaves the source byte-identical when nothing resolves', () => {
		const { code, injected } = injectFallbacks(SRC, {});
		expect(code).toBe(SRC);
		expect(injected).toEqual([]);
	});
});

describe('fallbackResolverFor', () => {
	const content = {
		'layout:/': { branding: { name: 'Acme' }, hero: { title: 'From layout' } },
		'page:/about': { hero: { title: 'From page' } }
	};
	const result = { scopesByFile: new Map([['/app/Header.svelte', ['page:/about', 'layout:/']]]) };

	it('honours scope= and otherwise tries the reaching scopes leaf first', () => {
		const resolve = fallbackResolverFor(result, '/app/Header.svelte', content);
		const { code } = injectFallbacks(
			`<script>import { CmsText } from '@velastack/cms';</script>` +
				`<CmsText name="hero.title" /><CmsText name="branding.name" scope="root" />`,
			resolve
		);
		expect(code).toContain('name="hero.title" fallback={"From page"}');
		expect(code).toContain('name="branding.name" fallback={"Acme"} scope="root"');
	});

	it('returns undefined for files the manifest never reached', () => {
		const resolve = fallbackResolverFor(result, '/app/Other.svelte', content);
		expect(
			resolve({
				name: 'hero.title',
				component: 'CmsText',
				local: 'CmsText',
				scope: null,
				preset: null,
				dynamic: false,
				hasValue: false,
				hasFallback: false,
				line: 1,
				start: 0,
				end: 0
			})
		).toBeUndefined();
	});
});

describe('checkContent', () => {
	const site = (scopeId: string, name: string, component: string, fallback = false) => ({
		scopeId,
		name,
		component,
		fallback,
		file: `/app/src/routes${scopeId.slice(scopeId.indexOf(':') + 1)}/+page.svelte`,
		line: 1
	});
	const usageSites = [
		site('layout:/', 'footer', 'CmsText'),
		site('layout:/', 'brand', 'CmsText'),
		site('page:/', 'a', 'CmsText', true),
		site('page:/', 'stats', 'CmsStats'),
		site('page:/', 'on', 'CmsBoolean'),
		site('page:/', 'hero.title', 'CmsText'),
		site('page:/rooms/[slug]', 'gallery', 'CmsGallery')
	];
	const scope = (scopeId: string, kind: 'layout' | 'page', names: string[]) => ({
		scopeId,
		kind,
		routeId: scopeId.slice(scopeId.indexOf(':') + 1),
		ownedParams: [],
		fields: names,
		usages: names.map((name) => ({ name, component: 'CmsText' }))
	});
	const manifest = {
		version: 1 as const,
		routes: {
			'/': {
				scopes: [
					scope('layout:/', 'layout', ['footer', 'brand']),
					scope('page:/', 'page', ['a', 'stats', 'on', 'hero.title'])
				],
				entriesRouteIds: []
			},
			'/rooms/[slug]': {
				scopes: [
					scope('layout:/', 'layout', ['footer', 'brand']),
					scope('page:/rooms/[slug]', 'page', ['gallery'])
				],
				entriesRouteIds: []
			}
		}
	};
	const en = {
		'layout:/': { footer: 'F', oldBanner: { text: 'x', visible: true } },
		'page:/': {
			stats: { items: [{ id: '1', value: '7' }] },
			hero: { title: 'T', subtitle: 'S' },
			metadata: { title: 'Home', price: 3 }
		},
		'page:/gone': { x: 1 },
		site: { seo: { schemaType: 'Hotel' } }
	};
	const es = { 'page:/': { hero: { title: 'T es', tagline: 'x' } } };

	const { missing, stale } = checkContent({ manifest, usageSites }, { en, es }, 'en');

	it('lists usages with neither a fallback prop nor a content value', () => {
		expect(missing.map((m) => `${m.scopeId} ${m.name}`)).toEqual([
			'layout:/ brand',
			'page:/rooms/[slug] gallery'
		]);
	});

	it('exempts CmsBoolean, whose value is false until set', () => {
		expect(missing.some((m) => m.name === 'on')).toBe(false);
	});

	it('flags content no usage reads, once per branch, in every locale', () => {
		expect(stale).toEqual([
			{ locale: 'en', scopeId: 'layout:/', path: 'oldBanner' },
			{ locale: 'en', scopeId: 'page:/', path: 'hero.subtitle' },
			{ locale: 'en', scopeId: 'page:/gone', path: null },
			{ locale: 'es', scopeId: 'page:/', path: 'hero.tagline' }
		]);
	});

	it('reads a structured value as a whole and leaves metadata and site alone', () => {
		expect(stale.some((s) => s.path?.startsWith('stats'))).toBe(false);
		expect(stale.some((s) => s.path?.startsWith('metadata'))).toBe(false);
		expect(stale.some((s) => s.scopeId === 'site')).toBe(false);
	});
});
