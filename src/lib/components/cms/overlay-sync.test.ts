import { describe, expect, it } from 'vitest';
import {
	composeKey,
	deriveOverlayIntents,
	type OverlayIntent,
	type OverlaySyncInput
} from './overlay-sync.ts';

const baseInput = (overrides: Partial<OverlaySyncInput> = {}): OverlaySyncInput => ({
	versionKey: null,
	locale: 'en',
	pageLocale: 'en',
	openReleaseKey: null,
	openReleaseFetched: false,
	previewParam: null,
	...overrides
});

describe('deriveOverlayIntents — refresh / mount race', () => {
	it('emits fetch-open-release before any draft decisions when unfetched', () => {
		const intents = deriveOverlayIntents(baseInput({ previewParam: 'foo' }));
		expect(intents).toEqual<OverlayIntent[]>([{ kind: 'fetch-open-release' }]);
	});

	it('does NOT strip ?preview= while openRelease is still being fetched', () => {
		const intents = deriveOverlayIntents(
			baseInput({ previewParam: 'stale-key', openReleaseFetched: false })
		);
		expect(intents).not.toContainEqual({ kind: 'set-preview-param', value: null });
		expect(intents.find((i) => i.kind === 'load-overlay')).toBeUndefined();
	});

	it('emits no fetch-open-release once already fetched', () => {
		const intents = deriveOverlayIntents(
			baseInput({ openReleaseFetched: true, openReleaseKey: 'k', previewParam: 'k' })
		);
		expect(intents).not.toContainEqual({ kind: 'fetch-open-release' });
	});
});

describe('deriveOverlayIntents — draft mode (no version)', () => {
	it('matching key + previewParam: loads draft overlay only', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: 'k',
				previewParam: 'k',
				locale: 'es',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'load-overlay', previewKey: 'k', locale: 'es' }
		]);
	});

	it('mismatched key: syncs ?preview= first (no overlay load this pass)', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: 'real-key',
				previewParam: 'old-key'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'set-preview-param', value: 'real-key' }
		]);
	});

	it('open release but no preview param: sync URL to add it', () => {
		const intents = deriveOverlayIntents(
			baseInput({ openReleaseFetched: true, openReleaseKey: 'k', previewParam: null })
		);
		expect(intents).toEqual<OverlayIntent[]>([{ kind: 'set-preview-param', value: 'k' }]);
	});

	it('no open release + stale ?preview= + same-locale view: strip + clear overlay', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: null,
				previewParam: 'stale',
				locale: 'en',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'set-preview-param', value: null },
			{ kind: 'clear-overlay' }
		]);
	});

	it('no open release + no preview param + same-locale view: just clear overlay', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: null,
				previewParam: null,
				locale: 'en',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([{ kind: 'clear-overlay' }]);
	});
});

describe('deriveOverlayIntents — non-default-locale fallback', () => {
	it('no draft + locale != pageLocale: loads published-only overlay (so default-locale fallback works)', () => {
		// Bug regression: viewing `?locale=es` with no draft and no es content
		// should fall back to en values, not the field component's fallback.
		// Requires the overlay to be loaded with previewKey=null + dual-fetch.
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: null,
				previewParam: null,
				locale: 'es',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'load-overlay', previewKey: null, locale: 'es' }
		]);
	});

	it('no draft + locale != pageLocale + stale ?preview=: strips param AND loads published overlay', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: null,
				previewParam: 'stale',
				locale: 'es',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'set-preview-param', value: null },
			{ kind: 'load-overlay', previewKey: null, locale: 'es' }
		]);
	});

	it('passes the active locale through to draft-overlay loads', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				openReleaseFetched: true,
				openReleaseKey: 'k',
				previewParam: 'k',
				locale: 'es',
				pageLocale: 'en'
			})
		);
		expect(intents).toContainEqual({
			kind: 'load-overlay',
			previewKey: 'k',
			locale: 'es'
		});
	});

	it('passes the active locale through to load-version-overlay', () => {
		const intents = deriveOverlayIntents(
			baseInput({ versionKey: 'v1', openReleaseFetched: true, locale: 'es', pageLocale: 'en' })
		);
		expect(intents).toContainEqual({
			kind: 'load-version-overlay',
			versionKey: 'v1',
			locale: 'es'
		});
	});
});

describe('deriveOverlayIntents — version mode', () => {
	it('emits version intents regardless of preview state', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				versionKey: 'v1',
				openReleaseFetched: true,
				openReleaseKey: 'k',
				previewParam: 'k',
				locale: 'en',
				pageLocale: 'en'
			})
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'fetch-version-release', versionKey: 'v1' },
			{ kind: 'load-version-overlay', versionKey: 'v1', locale: 'en' }
		]);
	});

	it('does not touch ?preview= in version mode', () => {
		const intents = deriveOverlayIntents(
			baseInput({
				versionKey: 'v1',
				openReleaseFetched: true,
				openReleaseKey: null,
				previewParam: 'stale',
				locale: 'en',
				pageLocale: 'en'
			})
		);
		expect(intents).not.toContainEqual({ kind: 'set-preview-param', value: null });
		expect(intents).not.toContainEqual({ kind: 'clear-overlay' });
	});

	it('combines fetch-open-release with version intents when unfetched', () => {
		const intents = deriveOverlayIntents(
			baseInput({ versionKey: 'v1', openReleaseFetched: false, locale: 'en' })
		);
		expect(intents).toEqual<OverlayIntent[]>([
			{ kind: 'fetch-open-release' },
			{ kind: 'fetch-version-release', versionKey: 'v1' },
			{ kind: 'load-version-overlay', versionKey: 'v1', locale: 'en' }
		]);
	});
});

describe('composeKey', () => {
	it('encodes scopeId-only when no params', () => {
		expect(
			composeKey({ scopeId: 'page:home', routeId: '/', params: {} }, 'en')
		).toBe('page:home|locale=en');
	});

	it('sorts param keys for stability', () => {
		const a = composeKey(
			{ scopeId: 'page:post', routeId: '/posts/[slug]', params: { slug: 'hi', a: '1' } },
			'en'
		);
		const b = composeKey(
			{ scopeId: 'page:post', routeId: '/posts/[slug]', params: { a: '1', slug: 'hi' } },
			'en'
		);
		expect(a).toBe(b);
		expect(a).toBe('page:post?a=1&slug=hi|locale=en');
	});

	it('isolates locales', () => {
		const en = composeKey({ scopeId: 'page:home', routeId: '/', params: {} }, 'en');
		const es = composeKey({ scopeId: 'page:home', routeId: '/', params: {} }, 'es');
		expect(en).not.toBe(es);
	});
});
