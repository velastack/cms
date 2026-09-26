import { describe, expect, it } from 'vitest';
import { cmsContact, contactView, formatAddress, toPostalAddress } from './contact.js';

const raw = {
	name: 'Casa Vela',
	address: {
		lines: ['Calle Mayor 12', ''],
		locality: 'Madrid',
		postcode: '28013',
		country: 'Spain'
	},
	phones: [
		{ id: 'desk', label: 'Front desk', number: '+34 910 000 000' },
		{ label: 'Empty', number: '' }
	],
	emails: [{ id: 'hi', label: 'Bookings', address: 'hello@casavela.example' }],
	whatsapp: '+34 600 000 000',
	geo: { lat: 40.4168, lng: -3.7038 },
	labels: { phone: 'Teléfono' }
};

describe('cmsContact', () => {
	it('normalizes with defaults and drops empty address lines', () => {
		const v = cmsContact.normalize(raw);
		expect(v.address.lines).toEqual(['Calle Mayor 12']);
		expect(v.labels).toMatchObject({ phone: 'Teléfono', email: 'Email' });
		expect(v.geo).toEqual({ lat: 40.4168, lng: -3.7038 });
		expect(cmsContact.normalize({ geo: { lat: 'x' } }).geo).toBeNull();
	});

	it('derives hrefs, the formatted address and a maps link', () => {
		const view = contactView(cmsContact.normalize(raw));
		expect(view.phones).toHaveLength(1);
		expect(view.telHref).toBe('tel:+34910000000');
		expect(view.mailto).toBe('mailto:hello@casavela.example');
		expect(view.whatsappHref).toBe('https://wa.me/34600000000');
		expect(view.mapsHref).toBe('https://www.google.com/maps/search/?api=1&query=40.4168,-3.7038');
		expect(view.formattedAddress).toEqual(['Calle Mayor 12', '28013 Madrid', 'Spain']);
	});

	it('prefers the directions URL and falls back to the address for maps', () => {
		const withUrl = contactView(
			cmsContact.normalize({ ...raw, directionsUrl: 'https://maps.app/x' })
		);
		expect(withUrl.mapsHref).toBe('https://maps.app/x');
		const addressOnly = contactView(
			cmsContact.normalize({
				address: { locality: 'Austin', region: 'TX', postcode: '78701', country: 'US' }
			})
		);
		expect(addressOnly.formattedAddress).toEqual(['Austin, TX 78701', 'US']);
		expect(addressOnly.mapsHref).toContain('query=Austin');
		expect(contactView(cmsContact.empty()).mapsHref).toBeNull();
	});

	it('orders postcode first for countries that do', () => {
		expect(
			formatAddress({
				lines: ['Rue A 1'],
				locality: 'Paris',
				region: '',
				postcode: '75001',
				country: 'FR'
			})
		).toEqual(['Rue A 1', '75001 Paris', 'FR']);
	});

	it('builds a PostalAddress or null', () => {
		expect(toPostalAddress(cmsContact.normalize(raw))).toEqual({
			'@type': 'PostalAddress',
			streetAddress: 'Calle Mayor 12',
			addressLocality: 'Madrid',
			postalCode: '28013',
			addressCountry: 'Spain'
		});
		expect(toPostalAddress(cmsContact.empty())).toBeNull();
	});
});
