/**
 * The currency a visitor reads prices in.
 *
 * Every price on a site is in the business's currency, the `currency` Site
 * Option. When the `currencies` option offers more, the visitor can pick one
 * and sees each price converted at the day's rate, marked `≈`: an estimate,
 * never what they are charged. The choice is kept in a cookie for a year.
 *
 * Rates come from velastack.dev, which publishes central bank reference rates
 * once for every site (https://velastack.dev/v1/rates); they are fetched in
 * the browser once a day and kept in localStorage. Headless: a template draws
 * its own select from `offered` and `current`, and calls `set`.
 */
import { cms } from './cms-store.svelte.js';
import { siteCurrencies, siteCurrency, siteLocale } from '../../core/site-currency.js';
import type { CollectionPrice } from '../../core/shapes/collection.js';

export const RATES_URL = 'https://velastack.dev/v1/rates';
const COOKIE = 'currency';
const RATES_KEY = 'vela-cms:rates';
const DAY = 24 * 60 * 60 * 1000;

export type Rates = {
	base: string;
	date: string;
	rates: Record<string, number>;
	fetchedAt: number;
};

class DisplayCurrency {
	/** The visitor's pick, or `''` for the business's own currency. */
	#picked = $state('');
	rates = $state<Rates | null>(null);
	#loaded = false;

	/** The business's currency, from Site Options. */
	get home(): string {
		return siteCurrency(cms.site) ?? '';
	}

	/** The currencies the site shows prices in: the business's own, then the others it offers. */
	get offered(): string[] {
		const home = this.home;
		if (!home) return [];
		return [home, ...siteCurrencies(cms.site).filter((code) => code !== home)];
	}

	/** The currency prices show in now. */
	get current(): string {
		return this.#picked && this.offered.includes(this.#picked) ? this.#picked : this.home;
	}

	/** Reads the cookie and the day's rates, once, in the browser. */
	load() {
		if (typeof document === 'undefined' || this.#loaded) return;
		this.#loaded = true;
		const saved = document.cookie.match(/(?:^|;\s*)currency=([A-Z]{3})/)?.[1];
		if (saved) this.#picked = saved;
		if (this.current !== this.home) void this.#loadRates();
	}

	/** Shows prices in `code`, one of `offered`, and remembers it. */
	set(code: string) {
		if (!this.offered.includes(code)) return;
		this.#picked = code;
		if (typeof document !== 'undefined') {
			document.cookie = `${COOKIE}=${code}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
		}
		if (code !== this.home) void this.#loadRates();
	}

	/** `amount` in `from` as the current currency, or `null` without a rate for either. */
	convert(amount: number, from = this.home): number | null {
		if (from === this.current) return amount;
		const rates = this.rates?.rates;
		const fromRate = rates?.[from];
		const toRate = rates?.[this.current];
		if (!fromRate || !toRate) return null;
		return (amount / fromRate) * toRate;
	}

	/**
	 * `amount` in `from`, as the visitor should read it: in the current currency
	 * with `≈` when it was converted, else as it is. `language` is the page's
	 * (`cms.locale`, or `<html lang>`), formatted for the business's country.
	 */
	format(amount: number, from = this.home, language?: string): string {
		const locale = siteLocale(cms.site, language ?? pageLanguage()) ?? 'en';
		const converted = this.convert(amount, from);
		if (converted === null || from === this.current) return money(amount, from, locale);
		return `≈ ${money(converted, this.current, locale)}`;
	}

	/**
	 * A collection item's price (`from €120 / night`) as the visitor reads it:
	 * converted and marked `≈` when they picked another currency. Empty
	 * without an amount, as `formatCollectionPrice` is.
	 */
	formatCollectionPrice(price: CollectionPrice, language?: string): string {
		if (price.amount === null) return '';
		const amount = this.format(price.amount, price.currency || this.home, language);
		return [price.prefix, amount, price.period ? `/ ${price.period}` : '']
			.filter(Boolean)
			.join(' ');
	}

	/** For tests and servers that already have the day's rates. */
	useRates(rates: Rates | null) {
		this.rates = rates;
	}

	async #loadRates() {
		if (this.rates && Date.now() - this.rates.fetchedAt < DAY) return;
		try {
			const cached = JSON.parse(localStorage.getItem(RATES_KEY) ?? 'null') as Rates | null;
			if (cached && Date.now() - cached.fetchedAt < DAY) {
				this.rates = cached;
				return;
			}
		} catch {
			// Unreadable storage: fetch instead.
		}
		try {
			const response = await fetch(RATES_URL);
			if (!response.ok) return;
			const body = (await response.json()) as Pick<Rates, 'base' | 'date' | 'rates'>;
			const rates: Rates = { ...body, fetchedAt: Date.now() };
			this.rates = rates;
			localStorage.setItem(RATES_KEY, JSON.stringify(rates));
		} catch {
			// No rates: prices stay in the business's currency.
		}
	}
}

const pageLanguage = (): string | undefined =>
	(typeof document !== 'undefined' && document.documentElement.lang) || undefined;

/** `amount` in `code`, formatted for `locale`; a code Intl refuses prints as `CODE 12`. */
export const money = (amount: number, code: string, locale: string): string => {
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: code,
			maximumFractionDigits: Number.isInteger(amount) && amount >= 100 ? 0 : 2
		}).format(amount);
	} catch {
		return `${code} ${amount}`.trim();
	}
};

export const displayCurrency = new DisplayCurrency();
