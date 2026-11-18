/**
 * `CmsCompany`: the business's profile. One identity (name, contact
 * defaults, social links) and a list of locations, each with its own
 * address, map position and hours; a location's contact details fall back
 * to the company's. A single-location business is a list of one.
 *
 * The value lives in the site tree at `company` and is not localised. The
 * host may manage it instead of the CMS: see {@link companyManagedBy}.
 */
import type { Tree } from '../path.js';
import { asBoolean, asEnum, asItems, asString, asStrings, isPlainObject } from '../structured.js';
import {
	cmsContact,
	contactView,
	toPostalAddress,
	DEFAULT_CONTACT_LABELS,
	type CmsContactValue,
	type ContactAddress,
	type ContactEmail,
	type ContactPhone,
	type ContactView
} from './contact.js';
import { defineForm, type FormField } from './form.js';
import {
	cmsHours,
	hoursView,
	toOpeningHoursSpecification,
	DEFAULT_HOURS_LABELS,
	type CmsHoursValue,
	type DayHours,
	type DayKey,
	type HoursException,
	type HoursLabels,
	type HoursView
} from './hours.js';
import {
	cmsSocialLinks,
	socialLinksView,
	toSameAs,
	type SocialLink,
	type SocialLinkView
} from './social-links.js';

export const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'] as const;

export type CompanyHours = {
	timezone: string;
	days: Record<DayKey, DayHours>;
	note: string;
	exceptions: HoursException[];
	byAppointment: boolean;
};

export type CompanyLocation = {
	id: string;
	/** `Downtown`. Empty when there is only one. */
	name: string;
	address: ContactAddress;
	geo: { lat: number; lng: number } | null;
	directionsUrl: string;
	/** How to get there: parking, entrance, transit. */
	directions: string;
	/** Own contact details; empty means the company's. */
	phones: ContactPhone[];
	emails: ContactEmail[];
	whatsapp: string;
	hours: CompanyHours;
};

export type CmsCompanyValue = {
	v: 1;
	name: string;
	legalName: string;
	tagline: string;
	description: string;
	/** schema.org type: `Hotel`, `Restaurant`, … Empty reads as `LocalBusiness`. */
	type: string;
	/** `''`, `$`, `$$`, `$$$` or `$$$$`. */
	priceRange: string;
	/** BCP-47 codes of the languages staff speak: `['es', 'en']`. */
	languages: string[];
	/** Free strings: `Cash`, `Visa`, … */
	paymentMethods: string[];
	/** Places served without a storefront visit. */
	areaServed: string[];
	phones: ContactPhone[];
	emails: ContactEmail[];
	whatsapp: string;
	website: string;
	bookingUrl: string;
	social: SocialLink[];
	/** The first is the primary. */
	locations: CompanyLocation[];
};

const nonEmpty = (v: unknown): string[] => asStrings(v).filter((s) => s !== '');

const normalizeLocation = (raw: Tree): Omit<CompanyLocation, 'id'> => {
	const contact = cmsContact.normalize(raw);
	const hours = cmsHours.normalize(raw.hours);
	return {
		name: asString(raw.name),
		address: contact.address,
		geo: contact.geo,
		directionsUrl: contact.directionsUrl,
		directions: asString(raw.directions),
		phones: contact.phones,
		emails: contact.emails,
		whatsapp: contact.whatsapp,
		hours: {
			timezone: hours.timezone,
			days: hours.days,
			note: hours.note,
			exceptions: hours.exceptions,
			byAppointment: asBoolean(isPlainObject(raw.hours) ? raw.hours.byAppointment : undefined)
		}
	};
};

/** A blank location, as "Add location" creates it. */
export const emptyLocation = (id: string): CompanyLocation => ({ id, ...normalizeLocation({}) });

const contactField = (key: string): FormField => {
	const { group: _group, ...field } = cmsContact.fields.find((f) => f.key === key)!;
	return field;
};
const hoursField = (key: string): FormField => {
	const { group: _group, ...field } = cmsHours.fields.find((f) => f.key === key)!;
	return field;
};

export const cmsCompany = defineForm<CmsCompanyValue>({
	component: 'CmsCompany',
	label: 'Company',
	version: 1,
	translatable: [],
	normalize: (raw) => {
		const r = isPlainObject(raw) ? raw : {};
		const contact = cmsContact.normalize(r);
		return {
			v: 1,
			name: contact.name,
			legalName: asString(r.legalName),
			tagline: asString(r.tagline),
			description: asString(r.description),
			type: asString(r.type),
			priceRange: asEnum(r.priceRange, ['', ...PRICE_RANGES], ''),
			languages: nonEmpty(r.languages),
			paymentMethods: nonEmpty(r.paymentMethods),
			areaServed: nonEmpty(r.areaServed),
			phones: contact.phones,
			emails: contact.emails,
			whatsapp: contact.whatsapp,
			website: asString(r.website),
			bookingUrl: asString(r.bookingUrl),
			social: cmsSocialLinks.normalize(r.social).items,
			locations: asItems<CompanyLocation>(r.locations, normalizeLocation)
		};
	},
	empty: () => ({
		v: 1,
		name: '',
		legalName: '',
		tagline: '',
		description: '',
		type: '',
		priceRange: '',
		languages: [],
		paymentMethods: [],
		areaServed: [],
		phones: [],
		emails: [],
		whatsapp: '',
		website: '',
		bookingUrl: '',
		social: [],
		locations: []
	}),
	// The company's own fields; the Company panel draws one group per tab.
	fields: [
		{ key: 'name', label: 'Name', type: 'text', group: 'Business' },
		{ key: 'legalName', label: 'Legal name', type: 'text', group: 'Business' },
		{ key: 'tagline', label: 'Tagline', type: 'text', group: 'Business' },
		{ key: 'description', label: 'Description', type: 'long-string', group: 'Business' },
		{
			key: 'type',
			label: 'Business type',
			type: 'text',
			placeholder: 'LocalBusiness',
			half: true,
			group: 'Business'
		},
		{
			key: 'priceRange',
			label: 'Price range',
			type: 'enum',
			values: PRICE_RANGES,
			group: 'Business'
		},
		{ key: 'languages', label: 'Languages', type: 'strings', placeholder: 'en', group: 'Business' },
		{
			key: 'paymentMethods',
			label: 'Payment methods',
			type: 'strings',
			placeholder: 'Visa',
			group: 'Business'
		},
		{ key: 'areaServed', label: 'Areas served', type: 'strings', group: 'Business' },
		{ ...contactField('phones'), group: 'Contact' },
		{ ...contactField('emails'), group: 'Contact' },
		{ ...contactField('whatsapp'), group: 'Contact' },
		{ key: 'website', label: 'Website', type: 'url', group: 'Contact' },
		{ key: 'bookingUrl', label: 'Booking URL', type: 'url', group: 'Contact' },
		{ ...cmsSocialLinks.fields[0], key: 'social', group: 'Social' }
	]
});

/**
 * One location's fields, by Company panel tab. `name` and the location's
 * own contact details only matter once there are several locations.
 */
export const COMPANY_LOCATION_FIELDS: readonly FormField[] = [
	{ key: 'name', label: 'Name', type: 'text', placeholder: 'Downtown', group: 'Location' },
	...[
		'address.lines',
		'address.locality',
		'address.region',
		'address.postcode',
		'address.country',
		'geo.lat',
		'geo.lng',
		'directionsUrl'
	].map((key) => ({ ...contactField(key), group: 'Location' })),
	{ key: 'directions', label: 'Getting there', type: 'long-string', group: 'Location' },
	{ ...contactField('phones'), group: 'Location' },
	{ ...contactField('emails'), group: 'Location' },
	{ ...contactField('whatsapp'), group: 'Location' },
	{ ...hoursField('note'), key: 'hours.note', group: 'Hours' },
	{ ...hoursField('exceptions'), key: 'hours.exceptions', group: 'Hours' },
	{ ...hoursField('timezone'), key: 'hours.timezone', group: 'Hours' },
	{ key: 'hours.byAppointment', label: 'By appointment', type: 'boolean', group: 'Hours' }
];

// ---------------------------------------------------------------------------
// Managed marker
// ---------------------------------------------------------------------------

/** Who manages the company profile instead of the CMS. */
export type CompanyManager = { by: string; url?: string };

/**
 * The host managing the company profile, from the site tree's reserved
 * `$managed.company`, or `null` when the CMS owns it. The backend writes the
 * marker on every read of a managed project and never stores it.
 */
export const companyManagedBy = (
	site: Record<string, unknown> | undefined
): CompanyManager | null => {
	const managed = site?.$managed;
	const m = isPlainObject(managed) ? managed.company : undefined;
	if (!isPlainObject(m) || typeof m.by !== 'string' || m.by === '') return null;
	return typeof m.url === 'string' && m.url !== '' ? { by: m.by, url: m.url } : { by: m.by };
};

// ---------------------------------------------------------------------------
// Derived view
// ---------------------------------------------------------------------------

type Reach = Pick<
	ContactView,
	'phones' | 'emails' | 'telHref' | 'mailto' | 'whatsapp' | 'whatsappHref'
>;

export type LocationView = Omit<CompanyLocation, 'phones' | 'emails' | 'whatsapp' | 'hours'> &
	Reach &
	Pick<ContactView, 'formattedAddress' | 'hasAddress' | 'mapsHref'> & {
		/** A keyless Google map with a pin, for `<iframe src>`; `null` without geo or address. */
		mapEmbedUrl: string | null;
		hours: HoursView & { byAppointment: boolean };
	};

export type CompanyView = Omit<
	CmsCompanyValue,
	'phones' | 'emails' | 'whatsapp' | 'social' | 'locations'
> &
	Reach & {
		social: SocialLinkView[];
		locations: LocationView[];
		/** The primary location, or `null` when there is none. */
		location: LocationView | null;
		hasLocations: boolean;
		isMultiLocation: boolean;
	};

/** A location as a contact value: its own contact details, else the company's. */
const locationContact = (
	company: CmsCompanyValue,
	location: CompanyLocation | undefined
): CmsContactValue => ({
	v: 1,
	name: company.name,
	address: location?.address ?? cmsContact.empty().address,
	phones: location?.phones.length ? location.phones : company.phones,
	emails: location?.emails.length ? location.emails : company.emails,
	whatsapp: location?.whatsapp || company.whatsapp,
	directionsUrl: location?.directionsUrl ?? '',
	geo: location?.geo ?? null,
	labels: DEFAULT_CONTACT_LABELS
});

const locationHours = (hours: CompanyHours, labels?: Partial<HoursLabels>): CmsHoursValue => ({
	v: 1,
	timezone: hours.timezone,
	days: hours.days,
	note: hours.note,
	exceptions: hours.exceptions,
	labels: { ...DEFAULT_HOURS_LABELS, ...labels }
});

const reach = (c: ContactView): Reach => ({
	phones: c.phones,
	emails: c.emails,
	telHref: c.telHref,
	mailto: c.mailto,
	whatsapp: c.whatsapp,
	whatsappHref: c.whatsappHref
});

const mapEmbedUrl = (c: ContactView): string | null => {
	const q = c.geo
		? `${c.geo.lat},${c.geo.lng}`
		: c.hasAddress
			? encodeURIComponent(c.formattedAddress.join(', '))
			: null;
	return q === null ? null : `https://www.google.com/maps?q=${q}&z=15&output=embed`;
};

/** What a template renders: hrefs, formatted addresses, map links and each location's hours view. */
export const companyView = (
	value: CmsCompanyValue,
	locale: string,
	labels?: Partial<HoursLabels>
): CompanyView => {
	const locations = value.locations.map((location): LocationView => {
		const c = contactView(locationContact(value, location));
		return {
			id: location.id,
			name: location.name,
			address: location.address,
			geo: location.geo,
			directionsUrl: location.directionsUrl,
			directions: location.directions,
			...reach(c),
			formattedAddress: c.formattedAddress,
			hasAddress: c.hasAddress,
			mapsHref: c.mapsHref,
			mapEmbedUrl: mapEmbedUrl(c),
			hours: {
				...hoursView(locationHours(location.hours, labels), locale),
				byAppointment: location.hours.byAppointment
			}
		};
	});
	return {
		...value,
		...reach(contactView(locationContact(value, undefined))),
		social: socialLinksView({ v: 1, items: value.social }),
		locations,
		location: locations[0] ?? null,
		hasLocations: locations.length > 0,
		isMultiLocation: locations.length > 1
	};
};

// ---------------------------------------------------------------------------
// Legacy projections: a company onto CmsContact, CmsHours and CmsSocialLinks
// ---------------------------------------------------------------------------

const locationOf = (
	company: CmsCompanyValue,
	locationId: string | undefined
): CompanyLocation | undefined =>
	locationId === undefined
		? company.locations[0]
		: company.locations.find((l) => l.id === locationId);

/**
 * The parts of a `CmsContact` value the company owns, for the primary
 * location or the one named. `null` when the company has nothing for it (no
 * name, contact details or location; an unknown id), so the caller keeps
 * the field's own value.
 */
export const companyContact = (
	company: CmsCompanyValue,
	locationId?: string
): Partial<CmsContactValue> | null => {
	const location = locationOf(company, locationId);
	if (locationId !== undefined && !location) return null;
	const c = locationContact(company, location);
	if (!location && !c.name && !c.phones.length && !c.emails.length && !c.whatsapp) return null;
	const { name, phones, emails, whatsapp } = c;
	return location
		? {
				name,
				address: c.address,
				phones,
				emails,
				whatsapp,
				directionsUrl: c.directionsUrl,
				geo: c.geo
			}
		: { name, phones, emails, whatsapp };
};

/** The parts of a `CmsHours` value the company owns; `null` when the location has no hours. */
export const companyHours = (
	company: CmsCompanyValue,
	locationId?: string
): Partial<CmsHoursValue> | null => {
	const hours = locationOf(company, locationId)?.hours;
	if (!hours) return null;
	const open = Object.values(hours.days).some((d) => !d.closed);
	if (!open && !hours.note && !hours.exceptions.length) return null;
	const { timezone, days, note, exceptions } = hours;
	return { timezone, days, note, exceptions };
};

/** The company's social links, or `null` when it has none. */
export const companySocial = (company: CmsCompanyValue): SocialLink[] | null =>
	company.social.length ? company.social : null;

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const withValues = (node: Tree): Tree => {
	const out: Tree = {};
	for (const [k, v] of Object.entries(node)) {
		if (v === null || v === undefined || v === '') continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = v;
	}
	return out;
};

/**
 * schema.org nodes for `<script type="application/ld+json">`. One location
 * (or none) gives a single node of the company's `type`; several give an
 * `Organization` plus one node per location with `parentOrganization`.
 */
export const toLocalBusiness = (
	value: CmsCompanyValue,
	options: { url?: string; image?: string } = {}
): Tree[] => {
	const url = options.url ?? value.website;
	const sameAs = toSameAs({ v: 1, items: value.social });
	const business = (location: CompanyLocation | undefined): Tree => {
		const c = locationContact(value, location);
		return {
			'@context': 'https://schema.org',
			'@type': value.type || 'LocalBusiness',
			name: location?.name ? `${value.name} (${location.name})` : value.name,
			description: value.description,
			url,
			image: options.image,
			telephone: c.phones.find((p) => p.number !== '')?.number,
			email: c.emails.find((e) => e.address !== '')?.address,
			address: toPostalAddress(c),
			geo: c.geo ? { '@type': 'GeoCoordinates', latitude: c.geo.lat, longitude: c.geo.lng } : null,
			openingHoursSpecification: location ? toOpeningHoursSpecification(location.hours) : [],
			priceRange: value.priceRange,
			paymentAccepted: value.paymentMethods.join(', '),
			knowsLanguage: value.languages,
			areaServed: value.areaServed
		};
	};

	if (value.locations.length <= 1) {
		return [withValues({ ...business(value.locations[0]), legalName: value.legalName, sameAs })];
	}

	const c = locationContact(value, undefined);
	const id = url ? `${url.replace(/\/$/, '')}/#organization` : undefined;
	const organization = withValues({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': id,
		name: value.name,
		legalName: value.legalName,
		description: value.description,
		url,
		image: options.image,
		telephone: c.phones.find((p) => p.number !== '')?.number,
		email: c.emails.find((e) => e.address !== '')?.address,
		sameAs
	});
	return [
		organization,
		...value.locations.map((location) =>
			withValues({
				...business(location),
				parentOrganization: id ? { '@id': id } : { '@type': 'Organization', name: value.name }
			})
		)
	];
};
