/**
 * The business's currency, from Site Options.
 *
 * A site has one currency: the one the business prices in and is paid in
 * (MXN for a bakery in Mexico). Templates declare it as a `currency` field in
 * one of their Site Options groups (`business.currency`, say), and every
 * price on the site is in it: a collection item's, a pricing tier's, the
 * WhatsApp cart's. A visitor sees another currency only as a display
 * conversion, which is a later concern, never as a second price.
 */

const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;

const asCode = (value: unknown, shape: RegExp): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const code = value.trim().toUpperCase();
	return shape.test(code) ? code : undefined;
};

/** A `key` field at the top level or in any group, as an upper-cased code of `shape`. */
const siteCode = (
	site: Record<string, unknown> | undefined,
	key: string,
	shape: RegExp
): string | undefined => {
	if (!site) return undefined;
	const top = asCode(site[key], shape);
	if (top) return top;
	for (const group of Object.values(site)) {
		if (group && typeof group === 'object' && !Array.isArray(group)) {
			const code = asCode((group as Record<string, unknown>)[key], shape);
			if (code) return code;
		}
	}
	return undefined;
};

/**
 * The ISO 4217 code a Site Options tree declares: a top-level `currency`, or
 * a `currency` field in whichever group the template put it in. `undefined`
 * when none is set or the value is not a three-letter code.
 */
export const siteCurrency = (site: Record<string, unknown> | undefined): string | undefined =>
	siteCode(site, 'currency', CURRENCY);

/**
 * The ISO 3166-1 alpha-2 code of the country the business is in, from a
 * `country` field declared like `currency`. `undefined` when none is set.
 */
export const siteCountry = (site: Record<string, unknown> | undefined): string | undefined =>
	siteCode(site, 'country', COUNTRY);

/**
 * The locale prices format in: the page's language, in the business's
 * country. A bare language does not know where the business is, and that
 * decides the format: Spanish alone shows MXN as `360,00 MXN`, Mexican
 * Spanish (`es-MX`) as `$360.00`, which is what the bakery's customers read.
 * A `language` that already names a region is kept as it is.
 */
export const siteLocale = (
	site: Record<string, unknown> | undefined,
	language: string | undefined
): string | undefined => {
	const country = siteCountry(site);
	if (!language) return undefined;
	if (!country || language.includes('-')) return language;
	return `${language}-${country}`;
};
