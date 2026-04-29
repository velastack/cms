import { describe, expect, it } from 'vitest';
import {
	PAGE_CMS_VIRTUAL_PREFIX,
	buildPagesModuleSource,
	hasGenerateEntriesImport,
	injectGenerateEntriesRouteId,
	injectScopeInstall,
	parsePageCmsIndex
} from './transforms.js';
import type { ScopeInfo } from './manifest.js';

describe('buildPagesModuleSource', () => {
	it('returns a frozen empty object for no modules', () => {
		const src = buildPagesModuleSource([]);
		expect(src).toContain('Object.freeze({})');
		expect(src).not.toContain('import');
	});

	it('imports each module via its synthetic id and tags it with routeId', () => {
		const src = buildPagesModuleSource([
			{ routeId: '/(marketing)/about', path: '/x/about/page.cms.ts' },
			{ routeId: '/(marketing)/rooms/[slug]', path: '/x/rooms/page.cms.ts' }
		]);
		expect(src).toContain(`import _0 from "${PAGE_CMS_VIRTUAL_PREFIX}0"`);
		expect(src).toContain(`import _1 from "${PAGE_CMS_VIRTUAL_PREFIX}1"`);
		expect(src).toContain(`"/(marketing)/about": { ..._0, routeId: "/(marketing)/about" }`);
		expect(src).toContain(
			`"/(marketing)/rooms/[slug]": { ..._1, routeId: "/(marketing)/rooms/[slug]" }`
		);
	});
});

describe('parsePageCmsIndex', () => {
	it('decodes a valid resolved synthetic id', () => {
		expect(parsePageCmsIndex('\0' + PAGE_CMS_VIRTUAL_PREFIX + '7')).toBe(7);
	});

	it('rejects ids without the resolved-virtual null prefix', () => {
		expect(parsePageCmsIndex(PAGE_CMS_VIRTUAL_PREFIX + '0')).toBeNull();
	});

	it('rejects unrelated ids', () => {
		expect(parsePageCmsIndex('virtual:vela-cms/manifest')).toBeNull();
		expect(parsePageCmsIndex('/some/file.ts')).toBeNull();
	});

	it('rejects non-integer or negative tails', () => {
		expect(parsePageCmsIndex('\0' + PAGE_CMS_VIRTUAL_PREFIX + 'abc')).toBeNull();
		expect(parsePageCmsIndex('\0' + PAGE_CMS_VIRTUAL_PREFIX + '1.5')).toBeNull();
		expect(parsePageCmsIndex('\0' + PAGE_CMS_VIRTUAL_PREFIX + '-1')).toBeNull();
	});

	it('accepts zero', () => {
		expect(parsePageCmsIndex('\0' + PAGE_CMS_VIRTUAL_PREFIX + '0')).toBe(0);
	});
});

describe('hasGenerateEntriesImport', () => {
	it('matches a simple named import', () => {
		expect(
			hasGenerateEntriesImport(`import { generateEntries } from '$lib/cms';\n`)
		).toBe(true);
	});

	it('matches in mixed bindings', () => {
		expect(
			hasGenerateEntriesImport(`import { load, generateEntries, foo } from '$lib/cms';\n`)
		).toBe(true);
	});

	it('matches with an alias', () => {
		expect(
			hasGenerateEntriesImport(`import { generateEntries as ge } from '$lib/cms';\n`)
		).toBe(true);
	});

	it('matches across multi-line braces', () => {
		expect(
			hasGenerateEntriesImport(
				`import {\n  generateEntries,\n  load\n} from '$lib/cms';\n`
			)
		).toBe(true);
	});

	it('does not match a name that merely contains the substring', () => {
		expect(
			hasGenerateEntriesImport(`import { generateEntriesHelper } from '$lib/cms';\n`)
		).toBe(false);
	});

	it('returns false when the import is absent', () => {
		expect(hasGenerateEntriesImport(`import { load } from '$lib/cms';\n`)).toBe(false);
	});

	it('returns false for a module with no imports', () => {
		expect(hasGenerateEntriesImport(`export const load = () => ({});\n`)).toBe(false);
	});
});

describe('injectGenerateEntriesRouteId', () => {
	it('rewrites zero-arg calls', () => {
		const out = injectGenerateEntriesRouteId(
			`export const entries = generateEntries();\n`,
			'/(marketing)/rooms/[slug]'
		);
		expect(out).toContain(`generateEntries('/(marketing)/rooms/[slug]')`);
	});

	it('tolerates whitespace inside the parens', () => {
		const out = injectGenerateEntriesRouteId(
			`generateEntries(\n)\ngenerateEntries(  )\n`,
			'/x'
		);
		expect(out).toBe(`generateEntries('/x')\ngenerateEntries('/x')\n`);
	});

	it('leaves explicit-arg calls untouched', () => {
		const code = `generateEntries('/already-set')\n`;
		expect(injectGenerateEntriesRouteId(code, '/x')).toBe(code);
	});

	it('escapes single quotes and backslashes in the routeId', () => {
		const out = injectGenerateEntriesRouteId(
			`generateEntries()\n`,
			"/has'quote\\back"
		);
		expect(out).toBe(`generateEntries('/has\\'quote\\\\back')\n`);
	});

	it('does not match unrelated identifiers ending in `generateEntries`', () => {
		const code = `myGenerateEntries()\n`;
		expect(injectGenerateEntriesRouteId(code, '/x')).toBe(code);
	});
});

describe('injectScopeInstall', () => {
	const info: ScopeInfo = {
		scopeId: 'page:/about',
		kind: 'page',
		routeId: '/about',
		ownedParams: []
	};

	it('inserts import + install call inside an existing instance script', () => {
		const code = `<script lang="ts">\nlet x = 1;\n</script>\n<h1>{x}</h1>`;
		const out = injectScopeInstall(code, info, '/x/+page.svelte');
		expect(out).toContain('installCmsScope as __velaCmsInstallScope');
		expect(out).toContain('__velaCmsInstallScope(');
		expect(out).toContain('"scopeId":"page:/about"');
		// Original code still present.
		expect(out).toContain('let x = 1;');
		expect(out).toContain('<h1>{x}</h1>');
	});

	it('creates a new instance script when none exists', () => {
		const code = `<h1>just markup</h1>`;
		const out = injectScopeInstall(code, info, '/x/+page.svelte');
		expect(out.startsWith('<script lang="ts">\n')).toBe(true);
		expect(out).toContain('installCmsScope as __velaCmsInstallScope');
		expect(out).toContain('<h1>just markup</h1>');
	});

	it('creates an instance script when only a module script exists', () => {
		const code = `<script context="module">\nexport const x = 1;\n</script>\n<h1>m</h1>`;
		const out = injectScopeInstall(code, info, '/x/+page.svelte');
		expect(out).toContain('installCmsScope as __velaCmsInstallScope');
		// Module script preserved.
		expect(out).toContain(`<script context="module">`);
		expect(out).toContain('export const x = 1;');
	});

	it('serializes ownedParams in the install call', () => {
		const layoutInfo: ScopeInfo = {
			scopeId: 'layout:/(marketing)/rooms/[slug]',
			kind: 'layout',
			routeId: '/(marketing)/rooms/[slug]',
			ownedParams: ['slug']
		};
		const out = injectScopeInstall(
			`<script>let x = 1;</script>`,
			layoutInfo,
			'/x/+layout.svelte'
		);
		expect(out).toContain('"ownedParams":["slug"]');
	});
});
