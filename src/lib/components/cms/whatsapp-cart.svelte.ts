/**
 * The cart a `CmsWhatsAppCart` checks out: items kept in the browser, which
 * checkout turns into a WhatsApp message to the business. Nothing is paid on
 * the site, so what is stored is what the visitor asked for, not a price.
 *
 * Module state, filled from localStorage by `load()` in the browser only, so
 * the server renders an empty cart and hydration agrees. Its methods run from
 * event handlers, never during a server render.
 */
import { orderSubtotal, type OrderLine } from '@velastack/whatsapp';

/** A line in the cart; its `price` is in the site's currency. */
export type WhatsAppCartItem = OrderLine & {
	/** The template's id for the item (a slug); lines with the same id merge. */
	id: string;
};

/** An order sent to WhatsApp, kept until the visitor says they're done. */
export type WhatsAppPlacedOrder = {
	ref: string;
	/** The chat link, to open it again. */
	href: string;
};

const STORAGE_KEY = 'vela-cms:whatsapp-cart';

class WhatsAppCart {
	items = $state<WhatsAppCartItem[]>([]);
	/** For the template's drawer or sheet, if it has one. */
	open = $state(false);
	placed = $state<WhatsAppPlacedOrder | null>(null);
	count = $derived(this.items.reduce((total, item) => total + item.quantity, 0));
	/**
	 * The currency every price is in: the business's own. `CmsWhatsAppCart`
	 * sets it from its `currency` prop or the `currency` site option.
	 */
	currency = $state('');
	/** Only when every item has a price; otherwise the business quotes. */
	subtotal = $derived(this.currency ? orderSubtotal(this.items, this.currency) : undefined);

	#loaded = false;

	/** Reads the saved cart, once, in the browser. Safe to call from any component's mount. */
	load() {
		if (typeof localStorage === 'undefined' || this.#loaded) return;
		this.#loaded = true;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
			if (Array.isArray(saved?.items)) this.items = saved.items;
			if (saved?.placed) this.placed = saved.placed;
		} catch {
			// Unreadable or blocked storage starts an empty cart.
		}
	}

	add(item: Omit<WhatsAppCartItem, 'quantity'>, quantity = 1) {
		this.load();
		// Adding after an order was sent starts the next one.
		if (this.placed) this.clear();
		const line = this.items.find((line) => line.id === item.id);
		if (line) line.quantity += quantity;
		else this.items.push({ ...item, quantity });
		this.#save();
	}

	/** A quantity of 0 removes the item. */
	setQuantity(id: string, quantity: number) {
		if (quantity <= 0) return this.remove(id);
		const line = this.items.find((line) => line.id === id);
		if (!line) return;
		line.quantity = quantity;
		this.#save();
	}

	remove(id: string) {
		this.items = this.items.filter((line) => line.id !== id);
		this.#save();
	}

	place(order: WhatsAppPlacedOrder) {
		this.placed = order;
		this.#save();
	}

	clear() {
		this.items = [];
		this.placed = null;
		this.#save();
	}

	#save() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ items: $state.snapshot(this.items), placed: this.placed })
			);
		} catch {
			// Storage can be full or blocked; the cart still works for this visit.
		}
	}
}

export const whatsappCart = new WhatsAppCart();
