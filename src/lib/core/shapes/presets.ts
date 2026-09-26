/**
 * The six list presets: fixed item shapes behind exported components, so a
 * template never invents a schema of its own. A new shape is a new preset.
 */
import { asItems, asString, isPlainObject } from '../structured.js';
import { defineForm, type FormField, type FormShape, type ListValue } from './form.js';
import { asImage, type CmsImageValue } from './image.js';
import { asLink, linkHref, type CmsLinkValue } from './link.js';
import type { Tree } from '../path.js';

type PresetOptions<I extends { id: string }> = {
	component: string;
	label: string;
	itemLabel: string;
	titleKey: string;
	translatable: readonly string[];
	fields: readonly FormField[];
	blank: () => Tree;
	normalizeItem: (raw: Tree) => Omit<I, 'id'>;
};

const definePreset = <I extends { id: string }>(o: PresetOptions<I>): FormShape<ListValue<I>> =>
	defineForm<ListValue<I>>({
		component: o.component,
		label: o.label,
		version: 1,
		translatable: [],
		items: { key: 'items', translatable: o.translatable },
		normalize: (raw) => {
			const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
			return { v: 1, items: asItems<I>(items, o.normalizeItem) };
		},
		empty: () => ({ v: 1, items: [] }),
		fields: [
			{
				key: 'items',
				label: o.label,
				type: 'list',
				itemLabel: o.itemLabel,
				titleKey: o.titleKey,
				blank: o.blank,
				fields: o.fields
			}
		]
	});

// --- Stats -----------------------------------------------------------------

export type StatItem = { id: string; value: string; label: string; note: string };
export type CmsStatsValue = ListValue<StatItem>;

export const cmsStats = definePreset<StatItem>({
	component: 'CmsStats',
	label: 'Stats',
	itemLabel: 'stat',
	titleKey: 'label',
	translatable: ['value', 'label', 'note'],
	blank: () => ({ value: '', label: '', note: '' }),
	fields: [
		{ key: 'value', label: 'Value', type: 'text', half: true, placeholder: '12k' },
		{ key: 'label', label: 'Label', type: 'text', placeholder: 'Guests a year' },
		{ key: 'note', label: 'Note', type: 'text' }
	],
	normalizeItem: (r) => ({
		value: asString(r.value),
		label: asString(r.label),
		note: asString(r.note)
	})
});

// --- Steps -----------------------------------------------------------------

export type StepItem = { id: string; title: string; body: string; image: CmsImageValue | null };
export type CmsStepsValue = ListValue<StepItem>;

export const cmsSteps = definePreset<StepItem>({
	component: 'CmsSteps',
	label: 'Steps',
	itemLabel: 'step',
	titleKey: 'title',
	translatable: ['title', 'body'],
	blank: () => ({ title: '', body: '', image: null }),
	fields: [
		{ key: 'title', label: 'Title', type: 'text' },
		{ key: 'body', label: 'Body', type: 'html' },
		{ key: 'image', label: 'Image', type: 'image' }
	],
	normalizeItem: (r) => ({
		title: asString(r.title),
		body: asString(r.body),
		image: asImage(r.image)
	})
});

// --- Timeline --------------------------------------------------------------

export type TimelineItem = {
	id: string;
	/** Free text: `2019`, `March 2024`. */
	date: string;
	title: string;
	body: string;
	image: CmsImageValue | null;
};
export type CmsTimelineValue = ListValue<TimelineItem>;

export const cmsTimeline = definePreset<TimelineItem>({
	component: 'CmsTimeline',
	label: 'Timeline',
	itemLabel: 'entry',
	titleKey: 'title',
	translatable: ['date', 'title', 'body'],
	blank: () => ({ date: '', title: '', body: '', image: null }),
	fields: [
		{ key: 'date', label: 'Date', type: 'text', half: true, placeholder: '2019' },
		{ key: 'title', label: 'Title', type: 'text' },
		{ key: 'body', label: 'Body', type: 'html' },
		{ key: 'image', label: 'Image', type: 'image' }
	],
	normalizeItem: (r) => ({
		date: asString(r.date),
		title: asString(r.title),
		body: asString(r.body),
		image: asImage(r.image)
	})
});

// --- Gallery ---------------------------------------------------------------

export type GalleryItem = { id: string; image: CmsImageValue | null; caption: string };
export type CmsGalleryValue = ListValue<GalleryItem>;

export const cmsGallery = definePreset<GalleryItem>({
	component: 'CmsGallery',
	label: 'Gallery',
	itemLabel: 'photo',
	titleKey: 'caption',
	translatable: ['caption'],
	blank: () => ({ image: null, caption: '' }),
	fields: [
		{ key: 'image', label: 'Photo', type: 'image' },
		{ key: 'caption', label: 'Caption', type: 'text' }
	],
	normalizeItem: (r) => ({ image: asImage(r.image ?? r.src), caption: asString(r.caption) })
});

// --- Logos -----------------------------------------------------------------

export type LogoItem = {
	id: string;
	image: CmsImageValue | null;
	name: string;
	link: CmsLinkValue | null;
};
export type CmsLogosValue = ListValue<LogoItem>;
export type LogoItemView = LogoItem & { href: string | null };

export const cmsLogos = definePreset<LogoItem>({
	component: 'CmsLogos',
	label: 'Logos',
	itemLabel: 'logo',
	titleKey: 'name',
	translatable: [],
	blank: () => ({ image: null, name: '', link: null }),
	fields: [
		{ key: 'name', label: 'Name', type: 'text' },
		{ key: 'image', label: 'Logo', type: 'image' },
		{ key: 'link', label: 'Link', type: 'link' }
	],
	normalizeItem: (r) => ({ image: asImage(r.image), name: asString(r.name), link: asLink(r.link) })
});

export const logosView = (value: CmsLogosValue): LogoItemView[] =>
	value.items
		.filter((l) => l.image !== null)
		.map((l) => ({ ...l, href: l.link ? linkHref(l.link) || null : null }));

// --- Schedule --------------------------------------------------------------

export type ScheduleItem = {
	id: string;
	/** Free text: `Monday`, `Sat 12 Oct`. */
	day: string;
	/** Free text: `10:00`, `7 – 9pm`. */
	time: string;
	title: string;
	body: string;
	location: string;
};
export type CmsScheduleValue = ListValue<ScheduleItem>;

export const cmsSchedule = definePreset<ScheduleItem>({
	component: 'CmsSchedule',
	label: 'Schedule',
	itemLabel: 'session',
	titleKey: 'title',
	translatable: ['day', 'time', 'title', 'body', 'location'],
	blank: () => ({ day: '', time: '', title: '', body: '', location: '' }),
	fields: [
		{ key: 'day', label: 'Day', type: 'text', half: true, placeholder: 'Monday' },
		{ key: 'time', label: 'Time', type: 'text', placeholder: '10:00 – 11:00' },
		{ key: 'title', label: 'Title', type: 'text' },
		{ key: 'location', label: 'Location', type: 'text' },
		{ key: 'body', label: 'Details', type: 'html' }
	],
	normalizeItem: (r) => ({
		day: asString(r.day),
		time: asString(r.time),
		title: asString(r.title),
		body: asString(r.body),
		location: asString(r.location)
	})
});

/** Sessions grouped by `day`, in first-seen order. */
export const scheduleByDay = (
	value: CmsScheduleValue
): Array<{ day: string; items: ScheduleItem[] }> => {
	const out: Array<{ day: string; items: ScheduleItem[] }> = [];
	for (const item of value.items) {
		if (item.title === '') continue;
		let group = out.find((g) => g.day === item.day);
		if (!group) out.push((group = { day: item.day, items: [] }));
		group.items.push(item);
	}
	return out;
};
