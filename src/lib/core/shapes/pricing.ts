/** `CmsPricing`: tiers with a feature checklist and a call to action. */
import { asBoolean, asItems, asNumber, asString, isPlainObject } from '../structured.js';
import { defineForm } from './form.js';
import { asLink, linkHref, type CmsLinkValue } from './link.js';

export type PricingFeature = { id: string; text: string; included: boolean };

export type PricingTier = {
	id: string;
	name: string;
	price: {
		amount: number | null;
		/** A quote, not a number: the template shows `labels.custom`. */
		custom: boolean;
		/** `month`, `person`… shown after the amount. */
		period: string;
	};
	description: string;
	features: PricingFeature[];
	cta: CmsLinkValue | null;
	highlighted: boolean;
	badge: string;
};

export type CmsPricingValue = {
	v: 1;
	/** ISO 4217, e.g. `EUR`. */
	currency: string;
	labels: { custom: string };
	items: PricingTier[];
};

export type PricingTierView = PricingTier & { priceText: string; href: string | null };

export const cmsPricing = defineForm<CmsPricingValue>({
	component: 'CmsPricing',
	label: 'Pricing',
	version: 1,
	translatable: ['labels.custom'],
	items: {
		key: 'items',
		translatable: ['name', 'description', 'badge', 'price.period'],
		items: { key: 'features', translatable: ['text'] }
	},
	normalize: (raw) => {
		const r = isPlainObject(raw) ? raw : {};
		const labels = isPlainObject(r.labels) ? r.labels : {};
		return {
			v: 1,
			currency: asString(r.currency),
			labels: { custom: asString(labels.custom, 'Custom') },
			items: asItems<PricingTier>(r.items, (t) => {
				const p = isPlainObject(t.price) ? t.price : {};
				return {
					name: asString(t.name),
					price: {
						amount: asNumber(p.amount),
						custom: asBoolean(p.custom, p.amount === 'custom'),
						period: asString(p.period)
					},
					description: asString(t.description),
					features: asItems<PricingFeature>(t.features, (f) => ({
						text: asString(f.text),
						included: asBoolean(f.included, true)
					})),
					cta: asLink(t.cta),
					highlighted: asBoolean(t.highlighted),
					badge: asString(t.badge)
				};
			})
		};
	},
	empty: () => ({ v: 1, currency: '', labels: { custom: 'Custom' }, items: [] }),
	fields: [
		{ key: 'currency', label: 'Currency', type: 'text', half: true, placeholder: 'EUR' },
		{ key: 'labels.custom', label: '“Custom” price label', type: 'text' },
		{
			key: 'items',
			label: 'Tiers',
			type: 'list',
			itemLabel: 'tier',
			titleKey: 'name',
			blank: () => ({
				name: '',
				price: { amount: null, custom: false, period: '' },
				description: '',
				features: [],
				cta: null,
				highlighted: false,
				badge: ''
			}),
			fields: [
				{ key: 'name', label: 'Name', type: 'text', half: true },
				{ key: 'badge', label: 'Badge', type: 'text', placeholder: 'Most popular' },
				{ key: 'price.amount', label: 'Price', type: 'number', half: true },
				{ key: 'price.period', label: 'Per', type: 'text', placeholder: 'month' },
				{ key: 'price.custom', label: 'Custom price (quote)', type: 'boolean' },
				{ key: 'description', label: 'Description', type: 'long-string' },
				{
					key: 'features',
					label: 'Features',
					type: 'list',
					itemLabel: 'feature',
					titleKey: 'text',
					blank: () => ({ text: '', included: true }),
					fields: [
						{ key: 'text', label: 'Feature', type: 'text' },
						{ key: 'included', label: 'Included', type: 'boolean' }
					]
				},
				{ key: 'cta', label: 'Call to action', type: 'link' },
				{ key: 'highlighted', label: 'Highlighted', type: 'boolean' }
			]
		}
	]
});

/** `€29 / month`, the custom label, or empty without an amount. */
export const formatPrice = (
	tier: PricingTier,
	value: Pick<CmsPricingValue, 'currency' | 'labels'>,
	locale: string
): string => {
	if (tier.price.custom) return value.labels.custom;
	if (tier.price.amount === null) return '';
	let amount: string;
	try {
		amount = value.currency
			? new Intl.NumberFormat(locale, {
					style: 'currency',
					currency: value.currency,
					maximumFractionDigits: Number.isInteger(tier.price.amount) ? 0 : 2
				}).format(tier.price.amount)
			: new Intl.NumberFormat(locale).format(tier.price.amount);
	} catch {
		amount = `${value.currency} ${tier.price.amount}`.trim();
	}
	return tier.price.period ? `${amount} / ${tier.price.period}` : amount;
};

/** Tiers with a name, each with its formatted price and CTA href. */
export const pricingView = (value: CmsPricingValue, locale: string): PricingTierView[] =>
	value.items
		.filter((t) => t.name !== '')
		.map((t) => ({
			...t,
			priceText: formatPrice(t, value, locale),
			href: t.cta ? linkHref(t.cta) || null : null
		}));
