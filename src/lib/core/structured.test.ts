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
