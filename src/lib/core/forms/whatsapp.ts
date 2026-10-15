/**
 * Building the `wa.me` link a `CmsWhatsAppForm` opens: the editor's format
 * string with the visitor's answers substituted, sent to the editor's number.
 */

const PLACEHOLDER = /\{([^{}\s]+)\}/g;

/**
 * Substitute `{field}` placeholders with the submitted values. A field sent
 * more than once (checkboxes, multi-selects) joins with commas; a placeholder
 * with no matching field, and file uploads, become empty.
 */
export const fillMessage = (template: string, data: FormData): string =>
	template.replace(PLACEHOLDER, (_, name: string) =>
		data
			.getAll(name)
			.filter((value): value is string => typeof value === 'string' && value !== '')
			.join(', ')
	);

/**
 * The digits `wa.me` wants: country code and number, no `+`, spaces or
 * dashes. A leading `00` international prefix is dropped, since no country
 * code starts with 0.
 */
export const whatsappNumber = (raw: string): string => raw.replace(/\D/g, '').replace(/^00/, '');

/** `https://wa.me/<number>?text=<message>`, or `null` when no number is set. */
export const whatsappHref = (number: string, message = ''): string | null => {
	const digits = whatsappNumber(number);
	if (!digits) return null;
	return message
		? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
		: `https://wa.me/${digits}`;
};
