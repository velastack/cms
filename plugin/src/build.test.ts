import { describe, expect, it } from 'vitest';
import { fallbackResolverFor, injectFallbacks, scanUsages } from './build.js';

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
