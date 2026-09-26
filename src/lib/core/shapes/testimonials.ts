/** `CmsTestimonials`: quotes with an author, a rating and a source, plus Review JSON-LD. */
import { asItems, asNumber, asString, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';
import { asImage, type CmsImageValue } from './image.js';

export type Testimonial = {
	id: string;
	quote: string;
	author: string;
	role: string;
	company: string;
	photo: CmsImageValue | null;
	/** 1 to 5, or `null` when not rated. */
	rating: number | null;
	source: { label: string; url: string };
	/** ISO date (`YYYY-MM-DD`), or empty. */
	date: string;
};

export type CmsTestimonialsValue = ListValue<Testimonial>;

const asRating = (v: unknown): number | null => {
	const n = asNumber(typeof v === 'string' ? Number(v) : v);
	return n !== null && n >= 1 && n <= 5 ? Math.round(n) : null;
};

export const cmsTestimonials = defineForm<CmsTestimonialsValue>({
	component: 'CmsTestimonials',
	label: 'Testimonials',
	version: 1,
	translatable: [],
	items: { key: 'items', translatable: ['quote', 'role'] },
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: asItems<Testimonial>(items, (r) => {
				const source = isPlainObject(r.source) ? r.source : {};
				return {
					quote: asString(r.quote),
					author: asString(r.author),
					role: asString(r.role),
					company: asString(r.company),
					photo: asImage(r.photo),
					rating: asRating(r.rating),
					source: { label: asString(source.label), url: asString(source.url) },
					date: asString(r.date)
				};
			})
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Quotes',
			type: 'list',
			itemLabel: 'testimonial',
			titleKey: 'author',
			blank: () => ({
				quote: '',
				author: '',
				role: '',
				company: '',
				photo: null,
				rating: null,
				source: { label: '', url: '' },
				date: ''
			}),
			fields: [
				{ key: 'quote', label: 'Quote', type: 'html' },
				{ key: 'author', label: 'Author', type: 'text', half: true },
				{ key: 'role', label: 'Role', type: 'text' },
				{ key: 'company', label: 'Company', type: 'text', half: true },
				{ key: 'date', label: 'Date', type: 'date' },
				{ key: 'rating', label: 'Rating', type: 'rating' },
				{ key: 'photo', label: 'Photo', type: 'image' },
				{ key: 'source.label', label: 'Source', type: 'text', half: true, placeholder: 'Google' },
				{ key: 'source.url', label: 'Source URL', type: 'url' }
			]
		}
	]
});

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '').trim();

/** Testimonials that have a quote. */
export const testimonialsView = (value: CmsTestimonialsValue): Testimonial[] =>
	value.items.filter((t) => stripTags(t.quote) !== '');

/** A schema.org `Review` node. `itemReviewed` is the business or product node. */
export const toReview = (
	item: Testimonial,
	itemReviewed?: Record<string, unknown>
): Record<string, unknown> => {
	const out: Record<string, unknown> = {
		'@type': 'Review',
		reviewBody: stripTags(item.quote),
		author: { '@type': 'Person', name: item.author }
	};
	if (item.rating !== null) {
		out.reviewRating = { '@type': 'Rating', ratingValue: item.rating, bestRating: 5 };
	}
	if (item.date) out.datePublished = item.date;
	if (item.source.label) out.publisher = { '@type': 'Organization', name: item.source.label };
	if (itemReviewed) out.itemReviewed = itemReviewed;
	return out;
};
