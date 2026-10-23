import { describe, expect, it } from 'vitest';
import { siteCurrency } from './site-currency.js';

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
