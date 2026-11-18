import { describe, expect, it } from 'vitest';
import {
	cmsCompany,
	companyContact,
	companyHours,
	companyManagedBy,
	companySocial,
	companyView,
	toLocalBusiness
} from './company.js';

const open = { closed: false, ranges: [{ open: '09:00', close: '17:00' }] };

const location = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
	id,
	name,
	address: { lines: ['Calle Mayor 12'], locality: 'Madrid', postcode: '28013', country: 'Spain' },
	geo: { lat: 40.4168, lng: -3.7038 },
	hours: { timezone: 'Europe/Madrid', days: { mon: open }, note: 'Ring the bell' },
	...extra
});

const raw = {
	name: 'Casa Vela',
	legalName: 'Casa Vela S.L.',
	description: 'A small hotel.',
	type: 'Hotel',
	priceRange: '$$',
	languages: ['es', '', 'en'],
	paymentMethods: ['Cash', 'Visa'],
	areaServed: ['Madrid'],
	phones: [{ id: 'desk', label: 'Front desk', number: '+34 910 000 000' }],
	emails: [{ id: 'hi', label: 'Bookings', address: 'hello@casavela.example' }],
	whatsapp: '+34 600 000 000',
	website: 'https://casavela.example',
	social: [{ id: 'ig', platform: 'instagram', url: 'https://instagram.com/casavela' }],
	locations: [location('centro', '')]
};

const two = {
	...raw,
	locations: [
		location('centro', 'Centro'),
		location('norte', 'Norte', {
			geo: null,
			phones: [{ id: 'n', label: 'Norte', number: '+34 911 111 111' }],
			hours: {}
		})
	]
};

describe('cmsCompany', () => {
	it('never throws and fills the shape from partial or garbage input', () => {
		for (const input of [undefined, null, 'x', 7, [], { locations: 'x' }, { locations: [null] }]) {
			expect(cmsCompany.normalize(input)).toEqual(cmsCompany.empty());
		}
		const v = cmsCompany.normalize({ priceRange: 'cheap', locations: [{ hours: { days: 3 } }] });
		expect(v.priceRange).toBe('');
		expect(v.locations[0].id).toBe('item-0');
		expect(v.locations[0].hours.days.mon).toEqual({ closed: true, ranges: [] });
		expect(v.locations[0].hours.byAppointment).toBe(false);
	});

	it('keeps what it is given', () => {
		const v = cmsCompany.normalize(raw);
		expect(v.languages).toEqual(['es', 'en']);
		expect(v.social[0]).toMatchObject({ platform: 'instagram', label: '' });
		expect(v.locations[0].address.lines).toEqual(['Calle Mayor 12']);
		expect(v.locations[0].hours.days.mon).toEqual(open);
		expect(cmsCompany.normalize(v)).toEqual(v);
	});
});

describe('companyView', () => {
	it('reads a single location as the primary', () => {
		const view = companyView(cmsCompany.normalize(raw), 'en');
		expect(view.hasLocations).toBe(true);
		expect(view.isMultiLocation).toBe(false);
		expect(view.location).toBe(view.locations[0]);
		expect(view.telHref).toBe('tel:+34910000000');
		expect(view.mailto).toBe('mailto:hello@casavela.example');
		expect(view.whatsappHref).toBe('https://wa.me/34600000000');
		expect(view.social[0].name).toBe('Instagram');
		const l = view.locations[0];
		expect(l.formattedAddress).toEqual(['Calle Mayor 12', '28013 Madrid', 'Spain']);
		expect(l.mapsHref).toBe('https://www.google.com/maps/search/?api=1&query=40.4168,-3.7038');
		expect(l.mapEmbedUrl).toBe('https://www.google.com/maps?q=40.4168,-3.7038&z=15&output=embed');
		expect(l.hours.rows[0]).toMatchObject({ days: 'Mon', closed: false });
		expect(l.hours.labels.closed).toBe('Closed');
	});

	it('gives a location the company contact details unless it has its own', () => {
		const view = companyView(cmsCompany.normalize(two), 'es', { closed: 'Cerrado' });
		expect(view.isMultiLocation).toBe(true);
		const [centro, norte] = view.locations;
		expect(centro.phones[0].number).toBe('+34 910 000 000');
		expect(norte.phones[0].number).toBe('+34 911 111 111');
		expect(norte.emails[0].address).toBe('hello@casavela.example');
		expect(norte.whatsappHref).toBe('https://wa.me/34600000000');
		expect(norte.mapEmbedUrl).toBe(
			`https://www.google.com/maps?q=${encodeURIComponent('Calle Mayor 12, 28013 Madrid, Spain')}&z=15&output=embed`
		);
		expect(norte.hours.rows[0].text).toBe('Cerrado');
	});

	it('has no location and no map without one', () => {
		const view = companyView(cmsCompany.normalize({ name: 'Casa Vela' }), 'en');
		expect(view.location).toBeNull();
		expect(view.hasLocations).toBe(false);
		const bare = companyView(cmsCompany.normalize({ locations: [{}] }), 'en').locations[0];
		expect(bare.mapsHref).toBeNull();
		expect(bare.mapEmbedUrl).toBeNull();
	});
});

describe('legacy projections', () => {
	const company = cmsCompany.normalize(two);

	it('projects the primary location, or the one named, onto a contact value', () => {
		expect(companyContact(company)).toMatchObject({
			name: 'Casa Vela',
			address: { locality: 'Madrid' },
			geo: { lat: 40.4168, lng: -3.7038 },
			phones: [{ number: '+34 910 000 000' }]
		});
		expect(companyContact(company, 'norte')?.phones?.[0].number).toBe('+34 911 111 111');
		expect(companyContact(company)).not.toHaveProperty('labels');
	});

	it('leaves the address alone when the company has no location', () => {
		const c = companyContact(cmsCompany.normalize({ name: 'Casa Vela' }));
		expect(c).toEqual({ name: 'Casa Vela', phones: [], emails: [], whatsapp: '' });
	});

	it('projects hours and social links', () => {
		expect(companyHours(company)).toMatchObject({
			timezone: 'Europe/Madrid',
			note: 'Ring the bell'
		});
		expect(companyHours(company)).not.toHaveProperty('labels');
		expect(companySocial(company)?.[0].url).toBe('https://instagram.com/casavela');
	});

	it('is null when the company has nothing for the field', () => {
		const empty = cmsCompany.empty();
		expect(companyContact(empty)).toBeNull();
		expect(companyHours(empty)).toBeNull();
		expect(companySocial(empty)).toBeNull();
		expect(companyContact(company, 'nope')).toBeNull();
		expect(companyHours(company, 'nope')).toBeNull();
		expect(companyHours(company, 'norte')).toBeNull();
	});
});

describe('toLocalBusiness', () => {
	it('is one node for a single location, without empty properties', () => {
		const nodes = toLocalBusiness(cmsCompany.normalize(raw), { image: 'https://x.example/a.jpg' });
		expect(nodes).toHaveLength(1);
		expect(nodes[0]).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Hotel',
			name: 'Casa Vela',
			legalName: 'Casa Vela S.L.',
			url: 'https://casavela.example',
			image: 'https://x.example/a.jpg',
			telephone: '+34 910 000 000',
			email: 'hello@casavela.example',
			address: { '@type': 'PostalAddress', addressLocality: 'Madrid' },
			geo: { '@type': 'GeoCoordinates', latitude: 40.4168, longitude: -3.7038 },
			openingHoursSpecification: [{ dayOfWeek: ['Monday'], opens: '09:00', closes: '17:00' }],
			sameAs: ['https://instagram.com/casavela'],
			priceRange: '$$',
			paymentAccepted: 'Cash, Visa',
			knowsLanguage: ['es', 'en'],
			areaServed: ['Madrid']
		});
		expect(toLocalBusiness(cmsCompany.normalize({ name: 'Casa Vela' }))).toEqual([
			{ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'Casa Vela' }
		]);
	});

	it('is an Organization plus one node per location for several', () => {
		const [org, centro, norte] = toLocalBusiness(cmsCompany.normalize(two), {
			url: 'https://casavela.example/'
		});
		expect(org).toMatchObject({
			'@type': 'Organization',
			'@id': 'https://casavela.example/#organization',
			name: 'Casa Vela',
			sameAs: ['https://instagram.com/casavela']
		});
		expect(centro).toMatchObject({
			'@type': 'Hotel',
			name: 'Casa Vela (Centro)',
			parentOrganization: { '@id': 'https://casavela.example/#organization' }
		});
		expect(centro).not.toHaveProperty('sameAs');
		expect(norte.telephone).toBe('+34 911 111 111');
		expect(norte).not.toHaveProperty('geo');
		expect(norte).not.toHaveProperty('openingHoursSpecification');
	});
});

describe('companyManagedBy', () => {
	it('reads the reserved marker from the site tree', () => {
		expect(companyManagedBy(undefined)).toBeNull();
		expect(companyManagedBy({ company: {} })).toBeNull();
		expect(companyManagedBy({ $managed: { company: { by: '' } } })).toBeNull();
		expect(companyManagedBy({ $managed: { company: { by: 'VelaBase' } } })).toEqual({
			by: 'VelaBase'
		});
		expect(
			companyManagedBy({ $managed: { company: { by: 'VelaBase', url: 'https://v.example' } } })
		).toEqual({ by: 'VelaBase', url: 'https://v.example' });
	});
});
