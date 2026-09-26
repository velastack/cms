/**
 * `CmsContact`: where and how to reach the business. Labels translate;
 * addresses and numbers do not. `contactView` adds the hrefs and the
 * formatted address a template renders.
 */
import type { Tree } from '../path.js';
import { asItems, asNumber, asString, asStrings, isPlainObject } from '../structured.js';
import { defineForm } from './form.js';

export type ContactPhone = { id: string; label: string; number: string };
export type ContactEmail = { id: string; label: string; address: string };
export type ContactAddress = {
	lines: string[];
	locality: string;
	region: string;
	postcode: string;
	country: string;
};
export type ContactLabels = {
	address: string;
	phone: string;
	email: string;
	whatsapp: string;
	directions: string;
};

export type CmsContactValue = {
	v: 1;
	name: string;
	address: ContactAddress;
	phones: ContactPhone[];
	emails: ContactEmail[];
	whatsapp: string;
	directionsUrl: string;
	geo: { lat: number; lng: number } | null;
	labels: ContactLabels;
};

export const DEFAULT_CONTACT_LABELS: ContactLabels = {
	address: 'Address',
	phone: 'Phone',
	email: 'Email',
	whatsapp: 'WhatsApp',
	directions: 'Directions'
};

export const cmsContact = defineForm<CmsContactValue>({
	component: 'CmsContact',
	label: 'Contact details',
	version: 1,
	translatable: [
		'labels.address',
		'labels.phone',
		'labels.email',
		'labels.whatsapp',
		'labels.directions'
	],
	items: [
		{ key: 'phones', translatable: ['label'] },
		{ key: 'emails', translatable: ['label'] }
	],
	normalize: (raw) => {
		const r = isPlainObject(raw) ? raw : {};
		const a = isPlainObject(r.address) ? r.address : {};
		const g = isPlainObject(r.geo) ? r.geo : null;
		const lat = g ? asNumber(g.lat) : null;
		const lng = g ? asNumber(g.lng) : null;
		const labels = isPlainObject(r.labels) ? r.labels : {};
		return {
			v: 1,
			name: asString(r.name),
			address: {
				lines: asStrings(a.lines).filter((l) => l !== ''),
				locality: asString(a.locality),
				region: asString(a.region),
				postcode: asString(a.postcode),
				country: asString(a.country)
			},
			phones: asItems<ContactPhone>(r.phones, (p) => ({
				label: asString(p.label),
				number: asString(p.number)
			})),
			emails: asItems<ContactEmail>(r.emails, (e) => ({
				label: asString(e.label),
				address: asString(e.address)
			})),
			whatsapp: asString(r.whatsapp),
			directionsUrl: asString(r.directionsUrl),
			geo: lat !== null && lng !== null ? { lat, lng } : null,
			labels: {
				address: asString(labels.address, DEFAULT_CONTACT_LABELS.address),
				phone: asString(labels.phone, DEFAULT_CONTACT_LABELS.phone),
				email: asString(labels.email, DEFAULT_CONTACT_LABELS.email),
				whatsapp: asString(labels.whatsapp, DEFAULT_CONTACT_LABELS.whatsapp),
				directions: asString(labels.directions, DEFAULT_CONTACT_LABELS.directions)
			}
		};
	},
	empty: () => ({
		v: 1,
		name: '',
		address: { lines: [], locality: '', region: '', postcode: '', country: '' },
		phones: [],
		emails: [],
		whatsapp: '',
		directionsUrl: '',
		geo: null,
		labels: { ...DEFAULT_CONTACT_LABELS }
	}),
	fields: [
		{ key: 'name', label: 'Business name', type: 'text' },
		{
			key: 'address.lines',
			label: 'Street address',
			type: 'strings',
			placeholder: 'One line per row'
		},
		{ key: 'address.locality', label: 'City', type: 'text', half: true },
		{ key: 'address.region', label: 'Region', type: 'text' },
		{ key: 'address.postcode', label: 'Postcode', type: 'text', half: true },
		{ key: 'address.country', label: 'Country', type: 'text' },
		{
			key: 'phones',
			label: 'Phone numbers',
			type: 'list',
			itemLabel: 'number',
			titleKey: 'label',
			blank: () => ({ label: '', number: '' }),
			fields: [
				{ key: 'label', label: 'Label', type: 'text', half: true, placeholder: 'Front desk' },
				{ key: 'number', label: 'Number', type: 'text', placeholder: '+34 600 000 000' }
			]
		},
		{
			key: 'emails',
			label: 'Email addresses',
			type: 'list',
			itemLabel: 'address',
			titleKey: 'label',
			blank: () => ({ label: '', address: '' }),
			fields: [
				{ key: 'label', label: 'Label', type: 'text', half: true, placeholder: 'Bookings' },
				{ key: 'address', label: 'Address', type: 'text', placeholder: 'hello@example.com' }
			]
		},
		{ key: 'whatsapp', label: 'WhatsApp number', type: 'text', group: 'Map & links' },
		{ key: 'directionsUrl', label: 'Directions URL', type: 'url', group: 'Map & links' },
		{ key: 'geo.lat', label: 'Latitude', type: 'number', half: true, group: 'Map & links' },
		{ key: 'geo.lng', label: 'Longitude', type: 'number', group: 'Map & links' },
		{ key: 'labels.address', label: '“Address”', type: 'text', half: true, group: 'Labels' },
		{ key: 'labels.phone', label: '“Phone”', type: 'text', group: 'Labels' },
		{ key: 'labels.email', label: '“Email”', type: 'text', half: true, group: 'Labels' },
		{ key: 'labels.whatsapp', label: '“WhatsApp”', type: 'text', group: 'Labels' },
		{ key: 'labels.directions', label: '“Directions”', type: 'text', group: 'Labels' }
	]
});

// ---------------------------------------------------------------------------
// Derived view
// ---------------------------------------------------------------------------

export const telHref = (number: string): string => `tel:${number.replace(/[^\d+]/g, '')}`;

export const whatsappHref = (number: string): string =>
	`https://wa.me/${number.replace(/[^\d]/g, '')}`;

/** Countries that write the postcode before the locality. Matched on ISO
 * code or English name, case-insensitively. */
const POSTCODE_FIRST = new Set([
	'es',
	'spain',
	'fr',
	'france',
	'de',
	'germany',
	'it',
	'italy',
	'pt',
	'portugal',
	'nl',
	'netherlands',
	'be',
	'belgium',
	'at',
	'austria',
	'ch',
	'switzerland',
	'se',
	'sweden',
	'no',
	'norway',
	'dk',
	'denmark',
	'fi',
	'finland',
	'pl',
	'poland',
	'cz',
	'czechia',
	'mx',
	'mexico'
]);

/** Address lines in the country's conventional order, empty parts dropped. */
export const formatAddress = (address: ContactAddress): string[] => {
	const { lines, locality, region, postcode, country } = address;
	const postcodeFirst = POSTCODE_FIRST.has(country.trim().toLowerCase());
	const cityLine = postcodeFirst
		? [postcode, locality].filter(Boolean).join(' ') + (region ? ` (${region})` : '')
		: [[locality, region].filter(Boolean).join(', '), postcode].filter(Boolean).join(' ');
	return [...lines, cityLine, country].map((l) => l.trim()).filter((l) => l !== '');
};

export type ContactView = Omit<CmsContactValue, 'phones' | 'emails'> & {
	phones: Array<ContactPhone & { href: string }>;
	emails: Array<ContactEmail & { href: string }>;
	/** First phone's `tel:` href, or `null`. */
	telHref: string | null;
	/** First email's `mailto:`, or `null`. */
	mailto: string | null;
	whatsappHref: string | null;
	/** `directionsUrl`, else a Google Maps link from `geo` or the address. */
	mapsHref: string | null;
	formattedAddress: string[];
	hasAddress: boolean;
};

export const contactView = (value: CmsContactValue): ContactView => {
	const phones = value.phones
		.filter((p) => p.number !== '')
		.map((p) => ({ ...p, href: telHref(p.number) }));
	const emails = value.emails
		.filter((e) => e.address !== '')
		.map((e) => ({ ...e, href: `mailto:${e.address}` }));
	const formattedAddress = formatAddress(value.address);
	let mapsHref: string | null = value.directionsUrl || null;
	if (!mapsHref && value.geo) {
		mapsHref = `https://www.google.com/maps/search/?api=1&query=${value.geo.lat},${value.geo.lng}`;
	}
	if (!mapsHref && formattedAddress.length > 0) {
		mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress.join(', '))}`;
	}
	return {
		...value,
		phones,
		emails,
		telHref: phones[0]?.href ?? null,
		mailto: emails[0]?.href ?? null,
		whatsappHref: value.whatsapp ? whatsappHref(value.whatsapp) : null,
		mapsHref,
		formattedAddress,
		hasAddress: formattedAddress.length > 0
	};
};

/** A schema.org `PostalAddress` node, or `null` without an address. */
export const toPostalAddress = (value: CmsContactValue): Tree | null => {
	const a = value.address;
	if (a.lines.length === 0 && !a.locality && !a.postcode && !a.country) return null;
	const out: Tree = { '@type': 'PostalAddress' };
	if (a.lines.length) out.streetAddress = a.lines.join(', ');
	if (a.locality) out.addressLocality = a.locality;
	if (a.region) out.addressRegion = a.region;
	if (a.postcode) out.postalCode = a.postcode;
	if (a.country) out.addressCountry = a.country;
	return out;
};
