import { describe, expect, it } from 'vitest';
import { mergeTree } from './path.js';
import {
	applyTranslations,
	asItems,
	asString,
	countTranslations,
	defineStructured,
	extractTranslations,
	stripTranslations,
	translatableFields,
	translationPath,
	ROOT_ID
} from './structured.js';

type Hours = {
	v: number;
	note: string;
	days: Array<{ id: string; label: string; open: string; close: string }>;
};

const hours = defineStructured<Hours>({
	component: 'CmsHours',
	version: 1,
	translatable: ['note'],
	items: { key: 'days', translatable: ['label'] },
	normalize: (raw) => {
		const r = (raw ?? {}) as Record<string, unknown>;
		return {
			v: 1,
			note: asString(r.note),
			days: asItems(r.days, (d) => ({
				label: asString(d.label),
				open: asString(d.open),
				close: asString(d.close)
			}))
		};
	},
	empty: () => ({ v: 1, note: '', days: [] })
});

const en: Hours = {
	v: 1,
	note: 'Closed on holidays',
	days: [
		{ id: 'mon', label: 'Monday', open: '09:00', close: '17:00' },
		{ id: 'sat', label: 'Saturday', open: '10:00', close: '14:00' }
	]
};

describe('defineStructured.read', () => {
	it('returns the fallback when nothing is stored', () => {
		expect(hours.read(undefined, en)).toEqual(en);
	});
	it('returns the empty value, not the fallback, when the value was cleared with null', () => {
		expect(hours.read(null, en)).toEqual({ v: 1, note: '', days: [] });
	});
	it('normalizes partial and legacy shapes', () => {
		expect(hours.read({ days: [{ label: 'Mon' }] }, en)).toEqual({
			v: 1,
			note: '',
			days: [{ id: 'item-0', label: 'Mon', open: '', close: '' }]
		});
	});
	it('applies a $t overlay carried on the merged value', () => {
		const merged = mergeTree(en, { $t: { mon: { label: 'Lunes' }, _: { note: 'Cerrado' } } });
		const read = hours.read(merged, en);
		expect(read.note).toBe('Cerrado');
		expect(read.days[0].label).toBe('Lunes');
		expect(read.days[1].label).toBe('Saturday');
		expect('$t' in read).toBe(false);
	});
});

describe('translation overlay', () => {
	it('builds the overlay path', () => {
		expect(translationPath('hours', 'mon', 'label')).toBe('hours.$t.mon.label');
		expect(translationPath('hours', ROOT_ID, 'note')).toBe('hours.$t._.note');
	});
	it('extracts only string leaves', () => {
		expect(extractTranslations({ $t: { mon: { label: 'L', n: 1 }, bad: 'x' } })).toEqual({
			mon: { label: 'L' }
		});
		expect(extractTranslations({ v: 1 })).toBeUndefined();
	});
	it('strips $t without touching the rest', () => {
		expect(stripTranslations({ v: 1, $t: { a: {} } })).toEqual({ v: 1 });
		expect(stripTranslations('x')).toBe('x');
	});
	it('ignores empty overlay strings so untranslated fields show the default', () => {
		const out = applyTranslations(en, { mon: { label: '' } }, hours);
		expect(out.days[0].label).toBe('Monday');
	});
	it('lists and counts translatable fields', () => {
		expect(translatableFields(en, hours)).toEqual([
			{ id: '_', field: 'note', source: 'Closed on holidays' },
			{ id: 'mon', field: 'label', source: 'Monday' },
			{ id: 'sat', field: 'label', source: 'Saturday' }
		]);
		expect(countTranslations(en, undefined, hours)).toEqual({ total: 3, missing: 3 });
		expect(countTranslations(en, { mon: { label: 'Lunes' } }, hours)).toEqual({
			total: 3,
			missing: 2
		});
	});
	it('survives the locale merge: es overlay over en structure never forks the list', () => {
		const esDoc = { hours: { $t: { sat: { label: 'Sábado' } } } };
		const merged = mergeTree({ hours: en }, esDoc);
		const read = hours.read(merged.hours, undefined);
		expect(read.days.map((d) => d.label)).toEqual(['Monday', 'Sábado']);
	});
});

describe('nested lists, dotted paths and string arrays', () => {
	type Collection = {
		v: number;
		labels: { more: string };
		items: Array<{
			id: string;
			title: string;
			tags: string[];
			details: Array<{ id: string; label: string; value: string }>;
		}>;
	};
	const schema = {
		translatable: ['labels.more'],
		items: {
			key: 'items',
			translatable: ['title', 'tags'],
			items: { key: 'details', translatable: ['label', 'value'] }
		}
	};
	const value: Collection = {
		v: 1,
		labels: { more: 'Read more' },
		items: [
			{
				id: 'a',
				title: 'Suite',
				tags: ['sea view', ''],
				details: [{ id: 'd1', label: 'Sleeps', value: '4' }]
			}
		]
	};

	it('lists every string at every level', () => {
		expect(translatableFields(value, schema)).toEqual([
			{ id: ROOT_ID, field: 'labels.more', source: 'Read more' },
			{ id: 'a', field: 'title', source: 'Suite' },
			{ id: 'a', field: 'tags.0', source: 'sea view' },
			{ id: 'd1', field: 'label', source: 'Sleeps' },
			{ id: 'd1', field: 'value', source: '4' }
		]);
	});

	it('applies an overlay at every level without mutating the source', () => {
		const overlay = {
			[ROOT_ID]: { 'labels.more': 'Leer más' },
			a: { title: 'Suite (es)', 'tags.0': 'vista al mar' },
			d1: { label: 'Duerme' }
		};
		const out = applyTranslations(value, overlay, schema);
		expect(out.labels.more).toBe('Leer más');
		expect(out.items[0].title).toBe('Suite (es)');
		expect(out.items[0].tags).toEqual(['vista al mar', '']);
		expect(out.items[0].details[0]).toEqual({ id: 'd1', label: 'Duerme', value: '4' });
		expect(value.labels.more).toBe('Read more');
		expect(value.items[0].tags[0]).toBe('sea view');
		expect(countTranslations(value, overlay, schema)).toEqual({ total: 5, missing: 1 });
	});

	it('reads a dotted key back flat from a nested $t branch', () => {
		const stored = { $t: { _: { labels: { more: 'Leer más' } }, a: { tags: { '0': 'vista' } } } };
		expect(extractTranslations(stored)).toEqual({
			_: { 'labels.more': 'Leer más' },
			a: { 'tags.0': 'vista' }
		});
	});

	it('accepts several item lists', () => {
		const contact = { phones: [{ id: 'p', label: 'Desk' }], emails: [{ id: 'e', label: 'Hi' }] };
		const s = {
			translatable: [],
			items: [
				{ key: 'phones', translatable: ['label'] },
				{ key: 'emails', translatable: ['label'] }
			]
		};
		expect(translatableFields(contact, s).map((f) => f.id)).toEqual(['p', 'e']);
	});
});

describe('read', () => {
	it('normalizes the fallback so a partial fallback is safe', () => {
		const out = hours.read(undefined, { days: [{ label: 'Mon' }] } as unknown as Hours);
		expect(out.note).toBe('');
		expect(out.days[0]).toEqual({ id: 'item-0', label: 'Mon', open: '', close: '' });
	});
});
