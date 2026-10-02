import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as devalue from 'devalue';
import staticAdapter from '@sveltejs/adapter-static';
import type { Adapter, Builder } from '@sveltejs/kit';
// @ts-expect-error — JS module; types come from JSDoc
import adapter, { buildParamExtractor, parseRouteSegments } from './adapter.js';
// @ts-expect-error — JS module; types come from JSDoc
import { setPageCmsModules } from './build-state.js';

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

describe('adapter (Kit 3 Builder contract)', () => {
	const ROOM_ROUTE = '/(marketing)/rooms/[slug]';
	const ROOM_SCOPE = `page:${ROOM_ROUTE}`;
	const STATE_KEY = Symbol.for('@velastack/cms.buildState');

	let out: string;
	beforeEach(() => {
		out = fs.mkdtempSync(path.join(os.tmpdir(), 'velacms-adapter-'));
	});
	afterEach(() => {
		fs.rmSync(out, { recursive: true, force: true });
		setPageCmsModules([]);
	});

	const roomData = () => {
		const params = { slug: 'suite-1' };
		const payload = {
			cms: {
				endpoint: 'https://cms.example/cms',
				page: { scopeId: ROOM_SCOPE, params },
				scopes: { [ROOM_SCOPE]: { params } },
				docs: { [ROOM_SCOPE]: { title: 'Suite 1' } },
				metadata: { title: 'Suite 1' }
			}
		};
		return JSON.stringify({
			type: 'data',
			nodes: [{ type: 'data', data: JSON.parse(devalue.stringify(payload)) }]
		});
	};

	/**
	 * The slice of Kit 3's `Builder` that adapter-static 4 and the cms wrapper
	 * use. Typed against the real interface so a Kit signature change breaks
	 * this file, not a production build.
	 */
	const fakeBuilder = () => {
		const warnings: string[] = [];
		const log = Object.assign(() => {}, {
			minor: () => {},
			info: () => {},
			error: () => {},
			success: () => {},
			err: () => {},
			prettyError: () => {},
			warn: (msg: string) => {
				warnings.push(msg);
			}
		}) satisfies Builder['log'];
		const fake = {
			log,
			config: { router: { type: 'pathname' } } as unknown as Builder['config'],
			routes: [
				{ id: '/', pattern: /^\/$/ },
				{ id: ROOM_ROUTE, pattern: /^\/rooms\/([^/]+?)\/?$/ }
			] as unknown as Builder['routes'],
			prerendered: {
				pages: new Map([
					['/', { file: 'index.html' }],
					['/rooms/suite-1', { file: 'rooms/suite-1.html' }]
				]),
				assets: new Map(),
				redirects: new Map(),
				paths: ['/', '/__data.json', '/rooms/suite-1', '/rooms/suite-1/__data.json']
			} satisfies Builder['prerendered'],
			generateEnvModule: () => {},
			writeClient: () => [],
			writePrerendered: (dest: string) => {
				const write = (rel: string, body: string) => {
					fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
					fs.writeFileSync(path.join(dest, rel), body);
				};
				write('index.html', '<html><head></head><body></body></html>');
				write('rooms/suite-1.html', '<html><head></head><body></body></html>');
				write('rooms/suite-1/__data.json', roomData());
				return [];
			},
			generateFallback: async (dest: string) => {
				fs.writeFileSync(dest, '<html><head><title>app</title></head><body></body></html>');
			},
			compress: async () => []
		} satisfies Partial<Builder>;
		return { builder: fake as unknown as Builder, warnings };
	};

	it('keeps every property of the inner adapter-static', () => {
		const inner = staticAdapter({ fallback: '200.html' });
		const outer: Adapter = adapter({ fallback: '200.html' });
		expect(outer.name).toBe('@velastack/cms-static');
		expect(Object.keys(outer).sort()).toEqual(Object.keys(inner).sort());
	});

	it('writes __fallback.json with placeholder params and injects the manifest into 200.html', async () => {
		setPageCmsModules([{ routeId: ROOM_ROUTE, path: 'page.cms.ts', creatable: true }]);
		const { builder, warnings } = fakeBuilder();
		await adapter({ pages: out, fallback: '200.html' }).adapt(builder);

		const fallback = JSON.parse(fs.readFileSync(path.join(out, 'rooms/__fallback.json'), 'utf-8'));
		const cms = devalue.unflatten(fallback.nodes[0].data).cms;
		expect(cms.page.params).toEqual({ slug: '%slug%' });
		expect(cms.scopes[ROOM_SCOPE].params).toEqual({ slug: '%slug%' });
		expect(cms.docs[ROOM_SCOPE]).toEqual({});
		expect(cms.metadata).toEqual({});
		expect(cms.endpoint).toBe('https://cms.example/cms');

		const html = fs.readFileSync(path.join(out, '200.html'), 'utf-8');
		const manifest = { creatable: { [ROOM_ROUTE]: { entries: [{ slug: 'suite-1' }] } } };
		expect(html).toContain(`<script>var __velastack_manifest = ${JSON.stringify(manifest)};`);
		expect(html).toMatch(/<\/script><\/head>/);
		expect(warnings).toEqual([]);
	});

	it('warns and leaves 200.html alone when the cms() plugin never reported', async () => {
		const state = (globalThis as Record<symbol, { reported?: boolean }>)[STATE_KEY];
		const reported = state.reported;
		state.reported = false;
		try {
			const { builder, warnings } = fakeBuilder();
			await adapter({ pages: out, fallback: '200.html' }).adapt(builder);
			expect(fs.existsSync(path.join(out, 'rooms/__fallback.json'))).toBe(true);
			expect(fs.readFileSync(path.join(out, '200.html'), 'utf-8')).not.toContain(
				'__velastack_manifest'
			);
			expect(warnings).toEqual([expect.stringContaining('no page.cms modules were seen')]);
		} finally {
			state.reported = reported;
		}
	});
});
