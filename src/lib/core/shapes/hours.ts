/**
 * `CmsHours`: a week of opening hours in the business's timezone, with
 * holiday exceptions and the labels a template needs around them. The
 * stored value is data only; `hoursView` derives what the template renders
 * (folded rows, today, open-now) in the visitor's locale.
 */
import type { Tree } from '../path.js';
import { asBoolean, asItems, asString, isPlainObject } from '../structured.js';
import { defineForm } from './form.js';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** `HH:MM`, 24-hour. */
export type HoursRange = { open: string; close: string };
export type DayHours = { closed: boolean; ranges: HoursRange[] };
export type HoursException = {
	id: string;
	/** `YYYY-MM-DD` */
	date: string;
	label: string;
	closed: boolean;
	ranges: HoursRange[];
};
export type HoursLabels = { closed: string; today: string; openNow: string; closedNow: string };

export type CmsHoursValue = {
	v: 1;
	/** IANA zone, e.g. `Europe/Madrid`. Empty means the visitor's zone. */
	timezone: string;
	days: Record<DayKey, DayHours>;
	note: string;
	exceptions: HoursException[];
	labels: HoursLabels;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const asTime = (v: unknown, fallback: string): string =>
	typeof v === 'string' && TIME.test(v) ? v : fallback;

const asRanges = (v: unknown): HoursRange[] => {
	if (!Array.isArray(v)) return [];
	const out: HoursRange[] = [];
	for (const r of v) {
		if (!isPlainObject(r)) continue;
		out.push({ open: asTime(r.open, '09:00'), close: asTime(r.close, '17:00') });
	}
	return out.slice(0, 2);
};

const asDay = (v: unknown): DayHours => {
	if (!isPlainObject(v)) return { closed: true, ranges: [] };
	const ranges = asRanges(v.ranges);
	return { closed: asBoolean(v.closed, ranges.length === 0), ranges };
};

export const DEFAULT_HOURS_LABELS: HoursLabels = {
	closed: 'Closed',
	today: 'Today',
	openNow: 'Open now',
	closedNow: 'Closed now'
};

const emptyDays = (): Record<DayKey, DayHours> => {
	const out = {} as Record<DayKey, DayHours>;
	for (const k of DAY_KEYS) out[k] = { closed: true, ranges: [] };
	return out;
};

export const cmsHours = defineForm<CmsHoursValue>({
	component: 'CmsHours',
	label: 'Opening hours',
	version: 1,
	translatable: ['note', 'labels.closed', 'labels.today', 'labels.openNow', 'labels.closedNow'],
	items: { key: 'exceptions', translatable: ['label'] },
	normalize: (raw) => {
		const r = isPlainObject(raw) ? raw : {};
		const days = isPlainObject(r.days) ? r.days : {};
		const labels = isPlainObject(r.labels) ? r.labels : {};
		const out: CmsHoursValue = {
			v: 1,
			timezone: asString(r.timezone),
			days: emptyDays(),
			note: asString(r.note),
			exceptions: asItems<HoursException>(r.exceptions, (e) => {
				const ranges = asRanges(e.ranges);
				return {
					date: asString(e.date),
					label: asString(e.label),
					closed: asBoolean(e.closed, ranges.length === 0),
					ranges
				};
			}),
			labels: {
				closed: asString(labels.closed, DEFAULT_HOURS_LABELS.closed),
				today: asString(labels.today, DEFAULT_HOURS_LABELS.today),
				openNow: asString(labels.openNow, DEFAULT_HOURS_LABELS.openNow),
				closedNow: asString(labels.closedNow, DEFAULT_HOURS_LABELS.closedNow)
			}
		};
		for (const k of DAY_KEYS) if (k in days) out.days[k] = asDay(days[k]);
		return out;
	},
	empty: () => ({
		v: 1,
		timezone: '',
		days: emptyDays(),
		note: '',
		exceptions: [],
		labels: { ...DEFAULT_HOURS_LABELS }
	}),
	// The week grid is a bespoke editor (cms-hours-editable); these are the
	// fields it renders below the grid through the generic form.
	fields: [
		{ key: 'note', label: 'Note', type: 'text', placeholder: 'Closed on public holidays' },
		{
			key: 'exceptions',
			label: 'Exceptions',
			type: 'list',
			itemLabel: 'exception',
			titleKey: 'label',
			blank: () => ({ date: '', label: '', closed: true, ranges: [] }),
			fields: [
				{ key: 'date', label: 'Date', type: 'date', half: true },
				{ key: 'label', label: 'Label', type: 'text', placeholder: 'Christmas Day' },
				{ key: 'closed', label: 'Closed all day', type: 'boolean' }
			]
		},
		{
			key: 'timezone',
			label: 'Timezone',
			type: 'text',
			placeholder: 'Europe/Madrid',
			group: 'Labels'
		},
		{ key: 'labels.closed', label: '“Closed”', type: 'text', half: true, group: 'Labels' },
		{ key: 'labels.today', label: '“Today”', type: 'text', group: 'Labels' },
		{ key: 'labels.openNow', label: '“Open now”', type: 'text', half: true, group: 'Labels' },
		{ key: 'labels.closedNow', label: '“Closed now”', type: 'text', group: 'Labels' }
	]
});

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const minutesOf = (hhmm: string): number => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};

/** `09:00` → `9:00 AM` (en) / `9:00` (es). */
export const formatTime = (hhmm: string, locale: string): string => {
	if (!TIME.test(hhmm)) return hhmm;
	const [h, m] = hhmm.split(':').map(Number);
	try {
		return new Intl.DateTimeFormat(locale, {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(2024, 0, 1, h, m)));
	} catch {
		return hhmm;
	}
};

/** `9:00 AM – 5:00 PM, 6:00 – 10:00 PM`, or the closed label. */
export const formatRanges = (ranges: HoursRange[], locale: string, closedLabel: string): string =>
	ranges.length === 0
		? closedLabel
		: ranges
				.map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}`)
				.join(', ');

/** Short weekday names in the visitor's locale, Monday first. */
export const dayNames = (
	locale: string,
	weekday: 'short' | 'long' = 'short'
): Record<DayKey, string> => {
	const out = {} as Record<DayKey, string>;
	let fmt: Intl.DateTimeFormat | null = null;
	try {
		fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' });
	} catch {
		fmt = null;
	}
	DAY_KEYS.forEach((k, i) => {
		// 2024-01-01 is a Monday.
		out[k] = fmt ? fmt.format(new Date(Date.UTC(2024, 0, 1 + i))) : k;
	});
	return out;
};

/** The current weekday, date and minute in `timezone` (the visitor's zone when empty or invalid). */
export const zonedNow = (
	timezone: string,
	now: Date = new Date()
): { key: DayKey; date: string; minutes: number } => {
	const keyOf = (weekday: string): DayKey => {
		const k = weekday.slice(0, 3).toLowerCase();
		return (DAY_KEYS as readonly string[]).includes(k) ? (k as DayKey) : 'mon';
	};
	if (timezone) {
		try {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				weekday: 'short',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			}).formatToParts(now);
			const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
			return {
				key: keyOf(p('weekday')),
				date: `${p('year')}-${p('month')}-${p('day')}`,
				minutes: Number(p('hour')) * 60 + Number(p('minute'))
			};
		} catch {
			/* fall through to the visitor's zone */
		}
	}
	const pad = (n: number) => String(n).padStart(2, '0');
	const day = (now.getDay() + 6) % 7; // Sunday → 6
	return {
		key: DAY_KEYS[day],
		date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		minutes: now.getHours() * 60 + now.getMinutes()
	};
};

export type HoursRow = {
	id: string;
	keys: DayKey[];
	/** `Mon – Fri`, `Sat`, `Sat, Sun` */
	days: string;
	/** Formatted ranges, or the closed label. */
	text: string;
	closed: boolean;
};

export type HoursToday = {
	key: DayKey;
	date: string;
	/** The value's `labels.today`. */
	label: string;
	/** `Mon` in the visitor's locale. */
	day: string;
	text: string;
	closed: boolean;
	exception: HoursException | null;
};

export type HoursExceptionRow = HoursException & { dateText: string; text: string };

export type HoursView = CmsHoursValue & {
	rows: HoursRow[];
	today: HoursToday;
	isOpenNow: boolean;
	/** `labels.openNow` or `labels.closedNow`. */
	status: string;
	exceptionRows: HoursExceptionRow[];
};

const sameHours = (a: DayHours, b: DayHours): boolean =>
	a.closed === b.closed &&
	a.ranges.length === b.ranges.length &&
	a.ranges.every((r, i) => r.open === b.ranges[i].open && r.close === b.ranges[i].close);

const effective = (d: { closed: boolean; ranges: HoursRange[] }): HoursRange[] =>
	d.closed ? [] : d.ranges;

const isOpenAt = (ranges: HoursRange[], minutes: number): boolean =>
	ranges.some((r) => {
		const open = minutesOf(r.open);
		const close = minutesOf(r.close);
		if (close <= open) return minutes >= open || minutes < close; // overnight
		return minutes >= open && minutes < close;
	});

export const formatDate = (iso: string, locale: string): string => {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return iso;
	try {
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
	} catch {
		return iso;
	}
};

export const hoursView = (
	value: CmsHoursValue,
	locale: string,
	now: Date = new Date()
): HoursView => {
	const names = dayNames(locale);
	const closedLabel = value.labels.closed;

	const rows: HoursRow[] = [];
	for (const key of DAY_KEYS) {
		const day = value.days[key];
		const last = rows[rows.length - 1];
		if (last && sameHours(value.days[last.keys[last.keys.length - 1]], day)) {
			last.keys.push(key);
			continue;
		}
		rows.push({
			id: key,
			keys: [key],
			days: '',
			text: formatRanges(effective(day), locale, closedLabel),
			closed: day.closed
		});
	}
	for (const row of rows) {
		const first = names[row.keys[0]];
		const lastName = names[row.keys[row.keys.length - 1]];
		row.days =
			row.keys.length === 1
				? first
				: row.keys.length === 2
					? `${first}, ${lastName}`
					: `${first} – ${lastName}`;
	}

	const z = zonedNow(value.timezone, now);
	const exception = value.exceptions.find((e) => e.date === z.date) ?? null;
	const todayRanges = effective(exception ?? value.days[z.key]);
	const today: HoursToday = {
		key: z.key,
		date: z.date,
		label: value.labels.today,
		day: names[z.key],
		text: formatRanges(todayRanges, locale, closedLabel),
		closed: todayRanges.length === 0,
		exception
	};
	const isOpenNow = isOpenAt(todayRanges, z.minutes);

	const exceptionRows: HoursExceptionRow[] = value.exceptions
		.filter((e) => e.date !== '')
		.map((e) => ({
			...e,
			dateText: formatDate(e.date, locale),
			text: formatRanges(effective(e), locale, closedLabel)
		}));

	return {
		...value,
		rows,
		today,
		isOpenNow,
		status: isOpenNow ? value.labels.openNow : value.labels.closedNow,
		exceptionRows
	};
};

const SCHEMA_DAYS: Record<DayKey, string> = {
	mon: 'Monday',
	tue: 'Tuesday',
	wed: 'Wednesday',
	thu: 'Thursday',
	fri: 'Friday',
	sat: 'Saturday',
	sun: 'Sunday'
};

/** schema.org `openingHoursSpecification` entries, one per distinct range. */
export const toOpeningHoursSpecification = (value: CmsHoursValue): Tree[] => {
	const byRange = new Map<string, { opens: string; closes: string; days: string[] }>();
	for (const key of DAY_KEYS) {
		for (const r of effective(value.days[key])) {
			const k = `${r.open}-${r.close}`;
			const entry = byRange.get(k) ?? { opens: r.open, closes: r.close, days: [] };
			entry.days.push(SCHEMA_DAYS[key]);
			byRange.set(k, entry);
		}
	}
	const out: Tree[] = [...byRange.values()].map((e) => ({
		'@type': 'OpeningHoursSpecification',
		dayOfWeek: e.days,
		opens: e.opens,
		closes: e.closes
	}));
	for (const e of value.exceptions) {
		if (!e.date) continue;
		if (e.closed || e.ranges.length === 0) {
			out.push({
				'@type': 'OpeningHoursSpecification',
				validFrom: e.date,
				validThrough: e.date,
				opens: '00:00',
				closes: '00:00'
			});
			continue;
		}
		for (const r of e.ranges) {
			out.push({
				'@type': 'OpeningHoursSpecification',
				validFrom: e.date,
				validThrough: e.date,
				opens: r.open,
				closes: r.close
			});
		}
	}
	return out;
};
