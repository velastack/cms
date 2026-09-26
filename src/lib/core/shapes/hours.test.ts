import { describe, expect, it } from 'vitest';
import {
	cmsHours,
	formatRanges,
	formatTime,
	hoursView,
	toOpeningHoursSpecification,
	zonedNow,
	type CmsHoursValue
} from './hours.js';

const week = (): CmsHoursValue =>
	cmsHours.normalize({
		timezone: 'Europe/Madrid',
		days: {
			mon: { ranges: [{ open: '09:00', close: '17:00' }] },
			tue: { ranges: [{ open: '09:00', close: '17:00' }] },
			wed: { ranges: [{ open: '09:00', close: '17:00' }] },
			thu: { ranges: [{ open: '09:00', close: '17:00' }] },
			fri: {
				ranges: [
					{ open: '09:00', close: '14:00' },
					{ open: '18:00', close: '23:00' }
				]
			},
			sat: { ranges: [{ open: '18:00', close: '02:00' }] },
			sun: { closed: true }
		},
		note: 'Closed on public holidays',
		exceptions: [{ id: 'xmas', date: '2026-12-25', label: 'Christmas', closed: true }]
	});

describe('cmsHours.normalize', () => {
	it('fills every day, defaults closed when there are no ranges, drops bad times', () => {
		const v = cmsHours.normalize({ days: { mon: { ranges: [{ open: '9am', close: '17:00' }] } } });
		expect(v.days.mon).toEqual({ closed: false, ranges: [{ open: '09:00', close: '17:00' }] });
		expect(v.days.sun).toEqual({ closed: true, ranges: [] });
		expect(v.labels.closed).toBe('Closed');
		expect(v.exceptions).toEqual([]);
	});

	it('keeps at most two ranges per day', () => {
		const v = cmsHours.normalize({
			days: {
				mon: {
					ranges: [
						{ open: '08:00', close: '10:00' },
						{ open: '11:00', close: '12:00' },
						{ open: '13:00', close: '14:00' }
					]
				}
			}
		});
		expect(v.days.mon.ranges).toHaveLength(2);
	});

	it('treats garbage as the empty week', () => {
		expect(cmsHours.normalize('nope')).toEqual(cmsHours.empty());
	});
});

describe('formatting', () => {
	it('formats times per locale', () => {
		expect(formatTime('09:00', 'en-US')).toBe('9:00 AM');
		expect(formatTime('21:30', 'es')).toBe('21:30');
		expect(formatTime('bad', 'en')).toBe('bad');
	});
	it('joins split shifts and uses the closed label', () => {
		expect(
			formatRanges(
				[
					{ open: '09:00', close: '14:00' },
					{ open: '18:00', close: '23:00' }
				],
				'en-US',
				'Closed'
			)
		).toBe('9:00 AM – 2:00 PM, 6:00 PM – 11:00 PM');
		expect(formatRanges([], 'en', 'Cerrado')).toBe('Cerrado');
	});
});

describe('hoursView', () => {
	// 2026-09-25 is a Friday. 12:00 UTC is 14:00 in Madrid.
	const fridayNoonUtc = new Date('2026-09-25T12:00:00Z');

	it('folds consecutive days with the same hours', () => {
		const view = hoursView(week(), 'en-US', fridayNoonUtc);
		expect(view.rows.map((r) => [r.days, r.text])).toEqual([
			['Mon – Thu', '9:00 AM – 5:00 PM'],
			['Fri', '9:00 AM – 2:00 PM, 6:00 PM – 11:00 PM'],
			['Sat', '6:00 PM – 2:00 AM'],
			['Sun', 'Closed']
		]);
		expect(view.rows[3].closed).toBe(true);
	});

	it('folds two days as a pair', () => {
		const v = week();
		v.days.sat = { closed: true, ranges: [] };
		expect(hoursView(v, 'en-US', fridayNoonUtc).rows.at(-1)?.days).toBe('Sat, Sun');
	});

	it('resolves today and open-now in the business timezone', () => {
		const view = hoursView(week(), 'en-US', fridayNoonUtc);
		expect(view.today.key).toBe('fri');
		expect(view.today.day).toBe('Fri');
		expect(view.today.text).toBe('9:00 AM – 2:00 PM, 6:00 PM – 11:00 PM');
		// 14:00 Madrid: between the two shifts.
		expect(view.isOpenNow).toBe(false);
		expect(view.status).toBe('Closed now');
		const morning = hoursView(week(), 'en-US', new Date('2026-09-25T08:00:00Z'));
		expect(morning.isOpenNow).toBe(true);
		expect(morning.status).toBe('Open now');
	});

	it('handles overnight ranges', () => {
		// Saturday 18:00–02:00; Sunday 00:30 Madrid is 22:30 UTC Saturday.
		const view = hoursView(week(), 'en-US', new Date('2026-09-26T22:30:00Z'));
		expect(view.today.key).toBe('sun');
		expect(view.isOpenNow).toBe(false); // Sunday is closed; overnight spill is not modelled
		const sat = hoursView(week(), 'en-US', new Date('2026-09-26T20:00:00Z'));
		expect(sat.isOpenNow).toBe(true);
	});

	it('applies an exception on its date', () => {
		const view = hoursView(week(), 'en-GB', new Date('2026-12-25T10:00:00Z'));
		expect(view.today.exception?.label).toBe('Christmas');
		expect(view.today.closed).toBe(true);
		expect(view.isOpenNow).toBe(false);
		expect(view.exceptionRows[0].dateText).toBe('25 Dec');
	});

	it('translates day names', () => {
		const view = hoursView(week(), 'es', fridayNoonUtc);
		expect(view.rows[0].days.toLowerCase()).toContain('lun');
	});
});

describe('zonedNow', () => {
	it('falls back to the local zone for an invalid timezone', () => {
		const now = new Date(2026, 8, 25, 10, 5);
		const z = zonedNow('Not/AZone', now);
		expect(z.key).toBe('fri');
		expect(z.minutes).toBe(605);
		expect(z.date).toBe('2026-09-25');
	});
});

describe('toOpeningHoursSpecification', () => {
	it('groups days by identical range and lists exceptions', () => {
		const spec = toOpeningHoursSpecification(week());
		expect(spec[0]).toEqual({
			'@type': 'OpeningHoursSpecification',
			dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
			opens: '09:00',
			closes: '17:00'
		});
		expect(spec.at(-1)).toMatchObject({ validFrom: '2026-12-25', opens: '00:00', closes: '00:00' });
	});
});
