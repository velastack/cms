/**
 * `CmsCollection`: services, rooms, programmes, tours, projects, case
 * studies. One fixed core plus a `details` key-value list for kind-specific
 * facts. Lists only: an item's `link` covers "read more".
 */
import type { Tree } from '../path.js';
import { asBoolean, asItems, asNumber, asString, asStrings, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';
import { asImage, asImages, type CmsImageValue } from './image.js';
import { asLink, linkHref, type CmsLinkValue } from './link.js';

export type CollectionDetail = { id: string; label: string; value: string };

export type CollectionPrice = {
	amount: number | null;
	/** ISO 4217, e.g. `EUR`. */
	currency: string;
	/** `night`, `person`, `hour`… shown after the amount. */
	period: string;
	/** `from`, shown before the amount. */
	prefix: string;
};

export type CollectionItem = {
	id: string;
	title: string;
	summary: string;
	body: string;
	image: CmsImageValue | null;
	gallery: CmsImageValue[];
	price: CollectionPrice;
	duration: string;
	link: CmsLinkValue | null;
	tags: string[];
	features: string[];
	featured: boolean;
	hidden: boolean;
	details: CollectionDetail[];
};

export type CmsCollectionValue = ListValue<CollectionItem>;

export type CollectionItemView = CollectionItem & { href: string | null };

export const cmsCollection = defineForm<CmsCollectionValue>({
	component: 'CmsCollection',
	label: 'Collection',
	version: 1,
	translatable: [],
	items: {
		key: 'items',
		translatable: [
			'title',
			'summary',
			'body',
			'duration',
			'tags',
			'features',
			'price.period',
			'price.prefix'
		],
		items: { key: 'details', translatable: ['label', 'value'] }
	},
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: asItems<CollectionItem>(items, (r) => {
				const p = isPlainObject(r.price) ? r.price : {};
				return {
					title: asString(r.title),
					summary: asString(r.summary),
					body: asString(r.body),
					image: asImage(r.image),
					gallery: asImages(r.gallery),
					price: {
						amount: asNumber(p.amount),
						currency: asString(p.currency),
						period: asString(p.period),
						prefix: asString(p.prefix)
					},
					duration: asString(r.duration),
					link: asLink(r.link),
					tags: asStrings(r.tags).filter((t) => t !== ''),
					features: asStrings(r.features).filter((f) => f !== ''),
					featured: asBoolean(r.featured),
					hidden: asBoolean(r.hidden),
					details: asItems<CollectionDetail>(r.details, (d) => ({
						label: asString(d.label),
						value: asString(d.value)
					}))
				};
			})
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Items',
			type: 'list',
			itemLabel: 'item',
			titleKey: 'title',
			blank: () => ({
				title: '',
				summary: '',
				body: '',
				image: null,
				gallery: [],
				price: { amount: null, currency: '', period: '', prefix: '' },
				duration: '',
				link: null,
				tags: [],
				features: [],
				featured: false,
				hidden: false,
				details: []
			}),
			fields: [
				{ key: 'title', label: 'Title', type: 'text', group: 'Details' },
				{ key: 'summary', label: 'Summary', type: 'long-string', group: 'Details' },
				{ key: 'body', label: 'Body', type: 'html', group: 'Details' },
				{
					key: 'duration',
					label: 'Duration',
					type: 'text',
					half: true,
					placeholder: '3 hours',
					group: 'Details'
				},
				{ key: 'link', label: 'Link', type: 'link', group: 'Details' },
				{
					key: 'tags',
					label: 'Tags',
					type: 'strings',
					placeholder: 'One per line',
					group: 'Details'
				},
				{
					key: 'features',
					label: 'Features',
					type: 'strings',
					placeholder: 'One per line',
					group: 'Details'
				},
				{
					key: 'details',
					label: 'Details',
					type: 'list',
					itemLabel: 'detail',
					titleKey: 'label',
					group: 'Details',
					blank: () => ({ label: '', value: '' }),
					fields: [
						{ key: 'label', label: 'Label', type: 'text', half: true, placeholder: 'Sleeps' },
						{ key: 'value', label: 'Value', type: 'text', placeholder: '4' }
					]
				},
				{ key: 'featured', label: 'Featured', type: 'boolean', group: 'Details' },
				{ key: 'hidden', label: 'Hidden', type: 'boolean', group: 'Details' },
				{ key: 'image', label: 'Image', type: 'image', group: 'Media' },
				{ key: 'gallery', label: 'Gallery', type: 'images', group: 'Media' },
				{
					key: 'price.prefix',
					label: 'Prefix',
					type: 'text',
					half: true,
					placeholder: 'from',
					group: 'Pricing'
				},
				{ key: 'price.amount', label: 'Amount', type: 'number', group: 'Pricing' },
				{
					key: 'price.currency',
					label: 'Currency',
					type: 'text',
					half: true,
					placeholder: 'EUR',
					group: 'Pricing'
				},
				{ key: 'price.period', label: 'Per', type: 'text', placeholder: 'night', group: 'Pricing' }
			]
		}
	]
});

export type CollectionSlice = {
	/** At most this many items. */
	limit?: number;
	/** Only featured items. */
	featured?: boolean;
	/** Only items carrying this tag. */
	tag?: string;
};

/** Visible items (not hidden, with a title), optionally sliced. */
export const collectionView = (
	value: CmsCollectionValue,
	slice: CollectionSlice = {}
): CollectionItemView[] => {
	let items = value.items.filter((i) => !i.hidden && i.title !== '');
	if (slice.featured) items = items.filter((i) => i.featured);
	if (slice.tag) items = items.filter((i) => i.tags.includes(slice.tag as string));
	if (slice.limit !== undefined && slice.limit >= 0) items = items.slice(0, slice.limit);
	return items.map((i) => ({ ...i, href: i.link ? linkHref(i.link) || null : null }));
};

/** Every tag in use, in first-seen order. */
export const collectionTags = (value: CmsCollectionValue): string[] => {
	const out: string[] = [];
	for (const item of value.items) for (const t of item.tags) if (!out.includes(t)) out.push(t);
	return out;
};

/** `from €120 / night`, or empty when there is no amount. */
export const formatCollectionPrice = (price: CollectionPrice, locale: string): string => {
	if (price.amount === null) return '';
	let amount: string;
	try {
		amount = price.currency
			? new Intl.NumberFormat(locale, {
					style: 'currency',
					currency: price.currency,
					maximumFractionDigits: Number.isInteger(price.amount) ? 0 : 2
				}).format(price.amount)
			: new Intl.NumberFormat(locale).format(price.amount);
	} catch {
		amount = `${price.currency} ${price.amount}`.trim();
	}
	return [price.prefix, amount, price.period ? `/ ${price.period}` : ''].filter(Boolean).join(' ');
};

/** A schema.org `ItemList` of the visible items. */
export const toItemList = (value: CmsCollectionValue, baseUrl = ''): Tree => ({
	'@context': 'https://schema.org',
	'@type': 'ItemList',
	itemListElement: collectionView(value).map((i, n) => {
		const item: Tree = { '@type': 'ListItem', position: n + 1, name: i.title };
		if (i.href) item.url = baseUrl + i.href;
		return item;
	})
});
