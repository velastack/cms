import { describe, expect, it } from 'vitest';
import { parseSvelteSource } from './parse-svelte.js';

describe('parseSvelteSource — imports', () => {
	it('extracts default imports', () => {
		const { imports } = parseSvelteSource(
			`<script>\nimport Foo from './Foo.svelte';\n</script>\n<Foo />`
		);
		expect(imports).toEqual([
			{ source: './Foo.svelte', bindings: [{ imported: 'default', local: 'Foo' }] }
		]);
	});

	it('extracts named imports', () => {
		const { imports } = parseSvelteSource(
			`<script>\nimport { CmsText, CmsImage } from '$lib/components/cms';\n</script>`
		);
		expect(imports).toHaveLength(1);
		expect(imports[0].source).toBe('$lib/components/cms');
		expect(imports[0].bindings).toEqual([
			{ imported: 'CmsText', local: 'CmsText' },
			{ imported: 'CmsImage', local: 'CmsImage' }
		]);
	});

	it('extracts mixed default + named imports', () => {
		const { imports } = parseSvelteSource(
			`<script>\nimport Header, { Logo } from './Header.svelte';\n</script>`
		);
		expect(imports[0].bindings).toEqual([
			{ imported: 'default', local: 'Header' },
			{ imported: 'Logo', local: 'Logo' }
		]);
	});

	it('preserves aliases via `as`', () => {
		const { imports } = parseSvelteSource(
			`<script>\nimport { CmsText as Text } from '$lib/components/cms';\n</script>`
		);
		expect(imports[0].bindings).toEqual([{ imported: 'CmsText', local: 'Text' }]);
	});

	it('captures imports from both module and instance scripts', () => {
		const code =
			`<script context="module">\nimport { foo } from './a';\n</script>` +
			`\n<script>\nimport { bar } from './b';\n</script>`;
		const { imports } = parseSvelteSource(code);
		const sources = imports.map((i) => i.source).sort();
		expect(sources).toEqual(['./a', './b']);
	});

	it('handles a file with no script blocks', () => {
		const { imports, instanceScript } = parseSvelteSource('<h1>hello</h1>');
		expect(imports).toEqual([]);
		expect(instanceScript).toBeNull();
	});
});

describe('parseSvelteSource — component usages', () => {
	it('captures `name` static value', () => {
		const code =
			`<script>\nimport { CmsText } from '$lib/components/cms';\n</script>` +
			`\n<CmsText name="hero.title" />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages).toEqual([
			{
				componentName: 'CmsText',
				fieldName: 'hero.title',
				hasValueAttr: false,
				routeIdAttr: null
			}
		]);
	});

	it('captures `routeId` static value', () => {
		const code =
			`<script>\nimport { CmsEntries } from '$lib/components/cms';\n</script>` +
			`\n<CmsEntries routeId="/(marketing)/rooms/[slug]" />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].routeIdAttr).toBe('/(marketing)/rooms/[slug]');
		expect(componentUsages[0].fieldName).toBeNull();
	});

	it('returns null routeIdAttr when routeId is dynamic', () => {
		const code =
			`<script>\nimport { CmsEntries } from '$lib/components/cms';\nlet r = '/x';\n</script>` +
			`\n<CmsEntries routeId={r} />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].routeIdAttr).toBeNull();
	});

	it('returns null fieldName when name is dynamic', () => {
		const code =
			`<script>\nimport { CmsText } from '$lib/components/cms';\nlet n = 'x';\n</script>` +
			`\n<CmsText name={n} />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].fieldName).toBeNull();
	});

	it('flags `value=` regardless of static-ness', () => {
		const code =
			`<script>\nimport { CmsText } from '$lib/components/cms';\nlet x = 1;\n</script>` +
			`\n<CmsText name="overridden" value={x} />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].hasValueAttr).toBe(true);
	});

	it('returns null fieldName when name attr is missing', () => {
		const code =
			`<script>\nimport { CmsText } from '$lib/components/cms';\n</script>` + `\n<CmsText />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].fieldName).toBeNull();
	});

	it('captures multi-chunk text values via concatenation', () => {
		// Adjacent text chunks (no expressions) should be joined.
		const code =
			`<script>\nimport { CmsText } from '$lib/components/cms';\n</script>` +
			`\n<CmsText name="hero.title" />`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages[0].fieldName).toBe('hero.title');
	});

	it('skips lowercase HTML elements (only Component nodes count)', () => {
		const code = `<div name="not-a-cms">x</div><span>y</span>`;
		const { componentUsages } = parseSvelteSource(code);
		expect(componentUsages).toEqual([]);
	});
});

describe('parseSvelteSource — instance script range', () => {
	it('reports content offsets when an instance script exists', () => {
		const code = `<script>\nlet x = 1;\n</script>\n<div>{x}</div>`;
		const { instanceScript, sourceLength } = parseSvelteSource(code);
		expect(instanceScript).not.toBeNull();
		expect(instanceScript!.contentStart).toBeGreaterThan(0);
		expect(instanceScript!.contentEnd).toBeGreaterThan(instanceScript!.contentStart);
		const inner = code.slice(instanceScript!.contentStart, instanceScript!.contentEnd);
		expect(inner).toContain('let x = 1;');
		expect(sourceLength).toBe(code.length);
	});

	it('returns null when only a module script is present', () => {
		const code = `<script context="module">\nexport const x = 1;\n</script>\n<div />`;
		const { instanceScript } = parseSvelteSource(code);
		expect(instanceScript).toBeNull();
	});

	it('returns null when there is no script at all', () => {
		const { instanceScript } = parseSvelteSource('<div>no script</div>');
		expect(instanceScript).toBeNull();
	});
});
