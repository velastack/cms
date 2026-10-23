import { describe, expect, it } from 'vitest';
import { siteCountry, siteCurrency, siteLocale } from './site-currency.js';

describe('siteCurrency', () => {
	it('reads a currency field from whichever group holds it', () => {
		expect(siteCurrency({ business: { currency: 'MXN' } })).toBe('MXN');
		expect(siteCurrency({ seo: { schemaType: 'Bakery' }, shop: { currency: ' eur ' } })).toBe(
			'EUR'
		);
		expect(siteCurrency({ currency: 'usd' })).toBe('USD');
	});

	it('is undefined without one, or with something that is not a code', () => {
		expect(siteCurrency(undefined)).toBeUndefined();
		expect(siteCurrency({})).toBeUndefined();
		expect(siteCurrency({ business: { currency: '' } })).toBeUndefined();
		expect(siteCurrency({ business: { currency: 'pesos' } })).toBeUndefined();
		expect(siteCurrency({ business: { currency: 12 } })).toBeUndefined();
	});
});

describe('siteCountry and siteLocale', () => {
	const site = { business: { currency: 'MXN', country: 'mx' } };

	it('reads the country the way it reads the currency', () => {
		expect(siteCountry(site)).toBe('MX');
		expect(siteCountry({ business: { country: 'Mexico' } })).toBeUndefined();
		expect(siteCountry({})).toBeUndefined();
	});

	it('puts the page language in the business country', () => {
		expect(siteLocale(site, 'es')).toBe('es-MX');
		expect(siteLocale(site, 'en')).toBe('en-MX');
		// A language that names its region already is left alone.
		expect(siteLocale(site, 'es-ES')).toBe('es-ES');
		// Without a country there is nothing to add.
		expect(siteLocale({ business: { currency: 'MXN' } }, 'es')).toBe('es');
		expect(siteLocale(site, undefined)).toBeUndefined();
	});

	it('is what makes a Mexican Spanish page show pesos as $', () => {
		const format = (locale: string) =>
			new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN' }).format(360);
		expect(format(siteLocale(site, 'es')!)).toBe('$360.00');
		expect(format('es').replace(/\s/g, ' ')).toBe('360,00 MXN');
	});
});
