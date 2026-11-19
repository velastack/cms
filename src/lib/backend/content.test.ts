import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCmsBackend } from './factory.js';
import {
	ContentEditError,
	applyChanges,
	changeProblem,
	fitContent,
	contentLocales,
	publishStaged,
	readContent,
	readDraft,
	stageChanges,
	stagedChanges,
	toReleaseItems
} from './content.js';

const backend = createCmsBackend({
	dbPath: ':memory:',
	uploadDir: mkdtempSync(join(tmpdir(), 'vela-content-'))
});
afterAll(() => backend.close());

const editor = { id: 'whatsapp-50255550000', email: '', name: 'Ana' };
let project = '';
let n = 0;

beforeEach(() => {
	project = `p${++n}`;
	backend.store.seed(project, {
		site: { locales: { es: true }, phone: '+502 5555 0000' },
		layouts: {
			en: {
				'/': {
					branding: { name: 'La Fonda' },
					hours: [
						{ day: 'Mon', open: '9am' },
						{ day: 'Tue', open: '9am' }
					]
				}
			},
			es: {
				'/': {
					branding: { name: 'La Fonda' },
					hours: [
						{ day: 'Lun', open: '9am' },
						{ day: 'Mar', open: '9am' }
					]
				}
			}
		},
		pages: {
			en: { '/menu': { title: 'Menu', lunch: { price: 45, vegetarian: false } } },
			es: { '/menu': { title: 'Menú', lunch: { price: 45, vegetarian: false } } }
		}
	});
});

const change = (doc: string, path: string, value: string | number | boolean, locale = 'en') => ({
	doc,
	path,
	value,
	locale
});

describe('readContent', () => {
	it('should list site options, layouts and pages of one language', () => {
		expect(readContent(backend.store, project, 'es').map((doc) => doc.id)).toEqual([
			'site',
			'layout:/',
			'page:/menu'
		]);
		expect(contentLocales(backend.store, project).sort()).toEqual(['en', 'es']);
	});
});

describe('changeProblem', () => {
	it('should accept an existing field given a value of its type', () => {
		const docs = readContent(backend.store, project, 'en');
		expect(changeProblem(docs, change('page:/menu', 'lunch.price', 50))).toBeNull();
		expect(changeProblem(docs, change('layout:/', 'hours.1.open', '10am'))).toBeNull();
	});

	it('should refuse unknown documents and fields, groups, and other types', () => {
		const docs = readContent(backend.store, project, 'en');
		expect(changeProblem(docs, change('page:/about', 'title', 'x'))).toMatch(/no document/);
		expect(changeProblem(docs, change('page:/menu', 'dinner.price', 1))).toMatch(/no field/);
		expect(changeProblem(docs, change('page:/menu', 'lunch', 'x'))).toMatch(/group of fields/);
		expect(changeProblem(docs, change('page:/menu', 'lunch.price', '50'))).toMatch(
			/holds a number/
		);
		expect(changeProblem(docs, change('page:/menu', '__proto__.x', 'x'))).toMatch(/not a field/);
	});
});

describe('toReleaseItems', () => {
	it('should carry the whole list when a change is inside one', () => {
		const docs = readContent(backend.store, project, 'en');
		const items = toReleaseItems(docs, 'en', [
			change('layout:/', 'hours.1.open', '10am'),
			change('layout:/', 'branding.name', 'La Fonda de Ana')
		]);
		expect(items).toEqual([
			{
				kind: 'layout',
				routeId: '/',
				locale: 'en',
				tree: {
					hours: [
						{ day: 'Mon', open: '9am' },
						{ day: 'Tue', open: '10am' }
					],
					branding: { name: 'La Fonda de Ana' }
				}
			}
		]);
	});
});

describe('applyChanges', () => {
	it('should publish the changes and leave everything else as it was', () => {
		applyChanges(
			backend.store,
			project,
			editor,
			[change('page:/menu', 'lunch.price', 50), change('layout:/', 'hours.0.open', '8am')],
			'Edited over WhatsApp'
		);
		const docs = readContent(backend.store, project, 'en');
		expect(docs.find((doc) => doc.id === 'page:/menu')!.tree).toEqual({
			title: 'Menu',
			lunch: { price: 50, vegetarian: false }
		});
		expect(docs.find((doc) => doc.id === 'layout:/')!.tree).toMatchObject({
			branding: { name: 'La Fonda' },
			hours: [
				{ day: 'Mon', open: '8am' },
				{ day: 'Tue', open: '9am' }
			]
		});
		// The other language is untouched.
		expect(
			readContent(backend.store, project, 'es').find((d) => d.id === 'page:/menu')!.tree
		).toEqual({
			title: 'Menú',
			lunch: { price: 45, vegetarian: false }
		});
		const [release] = backend.store.getReleaseHistory(project);
		expect(release.name).toBe('Edited over WhatsApp');
		expect(release.publishedBy.name).toBe('Ana');
	});

	it('should change site options', () => {
		applyChanges(backend.store, project, editor, [change('site', 'phone', '+502 5555 1111')], 'x');
		expect(backend.store.getPublishedSiteTree(project)).toMatchObject({
			phone: '+502 5555 1111',
			locales: { es: true }
		});
	});

	it('should change nothing when one change no longer applies', () => {
		expect(() =>
			applyChanges(
				backend.store,
				project,
				editor,
				[change('page:/menu', 'lunch.price', 50), change('page:/menu', 'gone', 'x')],
				'x'
			)
		).toThrow(ContentEditError);
		expect(
			readContent(backend.store, project, 'en').find((d) => d.id === 'page:/menu')!.tree
		).toMatchObject({
			lunch: { price: 45 }
		});
		expect(backend.store.getReleaseHistory(project)).toHaveLength(0);
	});
});

describe('staging', () => {
	it('should stage on top of what is already staged, and publish it all at once', () => {
		const first = stageChanges(backend.store, project, editor.id, [
			change('layout:/', 'hours.0.open', '8am')
		]);
		expect(first).toEqual([
			{ doc: 'layout:/', locale: 'en', path: 'hours.0.open', from: '9am', to: '8am' }
		]);
		// A list is replaced whole, so the second edit has to start from the first.
		stageChanges(backend.store, project, editor.id, [
			change('layout:/', 'hours.1.open', '10am'),
			change('page:/menu', 'title', 'Carta', 'es')
		]);

		// Nothing is live yet, but the editor's draft shows it.
		expect(
			readContent(backend.store, project, 'en').find((d) => d.id === 'layout:/')!.tree
		).toMatchObject({
			hours: [
				{ day: 'Mon', open: '9am' },
				{ day: 'Tue', open: '9am' }
			]
		});
		expect(
			readDraft(backend.store, project, 'en', editor.id).find((d) => d.id === 'layout:/')!.tree
		).toMatchObject({
			hours: [
				{ day: 'Mon', open: '8am' },
				{ day: 'Tue', open: '10am' }
			]
		});
		// Someone else's draft does not.
		expect(
			readDraft(backend.store, project, 'en', 'someone-else').find((d) => d.id === 'layout:/')!.tree
		).toMatchObject({ hours: [{ open: '9am' }, { open: '9am' }] });

		expect(stagedChanges(backend.store, project, editor.id)).toEqual([
			{ doc: 'layout:/', locale: 'en', path: 'hours.0.open', from: '9am', to: '8am' },
			{ doc: 'layout:/', locale: 'en', path: 'hours.1.open', from: '9am', to: '10am' },
			{ doc: 'page:/menu', locale: 'es', path: 'title', from: 'Menú', to: 'Carta' }
		]);

		const release = publishStaged(backend.store, project, editor, 'New hours');
		expect(release?.name).toBe('New hours');
		expect(
			readContent(backend.store, project, 'en').find((d) => d.id === 'layout:/')!.tree
		).toMatchObject({
			hours: [
				{ day: 'Mon', open: '8am' },
				{ day: 'Tue', open: '10am' }
			]
		});
		expect(
			readContent(backend.store, project, 'es').find((d) => d.id === 'page:/menu')!.tree
		).toMatchObject({
			title: 'Carta'
		});
		expect(stagedChanges(backend.store, project, editor.id)).toEqual([]);
		expect(publishStaged(backend.store, project, editor, 'again')).toBeNull();
	});

	it('should stage nothing when one change does not apply', () => {
		expect(() =>
			stageChanges(backend.store, project, editor.id, [
				change('page:/menu', 'lunch.price', 50),
				change('page:/menu', 'lunch.price', 'fifty', 'es')
			])
		).toThrow(/es: "lunch.price" holds a number/);
		expect(stagedChanges(backend.store, project, editor.id)).toEqual([]);
	});

	it('should report a staged change to site options', () => {
		stageChanges(backend.store, project, editor.id, [change('site', 'phone', '+502 5555 1111')]);
		expect(stagedChanges(backend.store, project, editor.id)).toEqual([
			{ doc: 'site', locale: '', path: 'phone', from: '+502 5555 0000', to: '+502 5555 1111' }
		]);
	});
});

describe('applyChanges across languages', () => {
	it('should publish every language in one release, dropping what was staged before', () => {
		stageChanges(backend.store, project, editor.id, [change('page:/menu', 'title', 'Leftover')]);
		applyChanges(
			backend.store,
			project,
			editor,
			[change('page:/menu', 'lunch.price', 50), change('page:/menu', 'lunch.price', 50, 'es')],
			'Edited over WhatsApp'
		);
		expect(backend.store.getReleaseHistory(project)).toHaveLength(1);
		for (const locale of ['en', 'es']) {
			expect(
				readContent(backend.store, project, locale).find((d) => d.id === 'page:/menu')!.tree
			).toMatchObject({ title: locale === 'en' ? 'Menu' : 'Menú', lunch: { price: 50 } });
		}
	});
});

describe('fitContent', () => {
	it('should drop the largest documents first when over budget', () => {
		const docs = [
			{ id: 'small', tree: { a: 'x' } },
			{ id: 'huge', tree: { a: 'x'.repeat(90_000) } }
		];
		expect(fitContent(docs)).toEqual({ docs: [docs[0]], omitted: ['huge'] });
	});
});
