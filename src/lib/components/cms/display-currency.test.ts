import { describe, expect, it } from 'vitest';
import { money } from './display-currency.svelte.js';

describe('money', () => {
	it('formats for the locale, whole amounts without decimals', () => {
		expect(money(360, 'MXN', 'es-MX')).toBe('$360');
		expect(money(5.5, 'MXN', 'es-MX')).toBe('$5.50');
		expect(money(360, 'MXN', 'en-MX')).toBe('MX$360');
		expect(money(20, 'USD', 'en-US')).toBe('$20.00');
	});

	it('survives a code Intl refuses', () => {
		expect(money(12, 'XYZ1', 'en')).toBe('XYZ1 12');
	});
});
