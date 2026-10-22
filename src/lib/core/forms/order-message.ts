/**
 * The message a `CmsWhatsAppCart` sends: the editor's template, filled from
 * the order by `@velastack/whatsapp`'s `orderPlaceholders`.
 */

/** The `{placeholders}` an order message can use. */
export const ORDER_PLACEHOLDERS = ['ref', 'items', 'total', 'name', 'phone', 'note'];

/** Until the editor writes one. Lines left empty (no total, no note) are dropped. */
export const DEFAULT_ORDER_MESSAGE =
	"Hi! I'd like to place an order ({ref}):\n\n{items}\n\n{total}\n\n{name} · {phone}\n{note}";

/** Drops the blank lines and dangling spaces that empty placeholders leave behind. */
export const tidyMessage = (message: string): string =>
	message
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
