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

const CODE = /^[A-Z]{3}$/;

const asCode = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const code = value.trim().toUpperCase();
	return CODE.test(code) ? code : undefined;
};

/**
 * The ISO 4217 code a Site Options tree declares: a top-level `currency`, or
 * a `currency` field in whichever group the template put it in. `undefined`
 * when none is set or the value is not a three-letter code.
 */
export const siteCurrency = (site: Record<string, unknown> | undefined): string | undefined => {
	if (!site) return undefined;
	const top = asCode(site.currency);
	if (top) return top;
	for (const group of Object.values(site)) {
		if (group && typeof group === 'object' && !Array.isArray(group)) {
			const code = asCode((group as Record<string, unknown>).currency);
			if (code) return code;
		}
	}
	return undefined;
};
