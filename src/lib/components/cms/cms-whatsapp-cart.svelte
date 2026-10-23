<script lang="ts" module>
	import type { CmsFormState } from './cms-form.svelte';
	import type { WhatsAppPlacedOrder } from './whatsapp-cart.svelte.js';
	import { whatsappCart } from './whatsapp-cart.svelte.js';

	export type CmsWhatsAppCartState = CmsFormState & {
		/** The cart: its items, count and subtotal, and the methods that change them. */
		readonly cart: typeof whatsappCart;
		/** The order last sent to WhatsApp, until `cart.clear()`. */
		readonly placed: WhatsAppPlacedOrder | null;
		/** An amount in the site's currency, formatted in the page's language. */
		formatPrice: (amount: number) => string;
	};
</script>

<script lang="ts">
	/**
	 * `CmsWhatsAppCart`: checkout for `whatsappCart`. The template's form
	 * asks for `name`, `phone` and an optional `note`; submitting turns the
	 * cart into the editor's message (`{ref}`, `{items}`, `{total}`, `{name}`,
	 * `{phone}`, `{note}`), opens it in WhatsApp to the editor's number, and
	 * records the order to the hosted form `key` in the background, so it is
	 * kept even if the visitor never sends the chat.
	 *
	 * The chat opens inside the submit handler, before the post settles: a
	 * popup opened after an `await` loses the click's user activation and is
	 * blocked. If it is blocked anyway, this tab goes to WhatsApp instead.
	 *
	 * The template draws the cart itself: items, quantities and add buttons
	 * call `whatsappCart`, and `children` gets the cart and how checkout went.
	 */
	import { onMount, type Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import {
		fillMessage,
		formatMoney,
		openChat,
		orderPlaceholders,
		orderRef,
		orderSubtotal,
		recordOrder,
		whatsappHref,
		type Order
	} from '@velastack/whatsapp';
	import Structured from './cms-structured.svelte';
	import FormControls from './cms-form-controls.svelte';
	import { cms, cmsStore } from './cms-store.svelte.js';
	import { siteCurrency, siteLocale } from '../../core/site-currency.js';
	import { useFormTarget, type FormStatus } from './use-form-target.svelte.js';
	import { setWhatsAppFieldNames } from './cms-whatsapp-form.svelte';
	import { cmsWhatsApp, type CmsWhatsAppValue } from '../../core/shapes/whatsapp.js';
	import {
		DEFAULT_ORDER_MESSAGE,
		ORDER_PLACEHOLDERS,
		tidyMessage
	} from '../../core/forms/order-message.js';

	type Props = Omit<HTMLFormAttributes, 'action' | 'method' | 'children'> & {
		/** The CMS field holding the number and message. */
		name: string;
		scope?: string;
		fallback?: Partial<CmsWhatsAppValue>;
		value?: unknown;
		/** The hosted form to record each order to, as the template manifest declares it. */
		key?: string;
		/** Record to this route instead. */
		action?: string;
		/**
		 * ISO 4217: the business's currency, which every price is in. Defaults
		 * to the `currency` Site Option.
		 */
		currency?: string;
		/**
		 * The business's WhatsApp number, when the template keeps it in its
		 * contact details rather than in this field's settings.
		 */
		number?: string;
		children: Snippet<[CmsWhatsAppCartState]>;
	};
	let {
		name,
		scope,
		fallback,
		value,
		key,
		action,
		currency,
		number,
		children: content,
		...rest
	}: Props = $props();

	$effect.pre(() => {
		whatsappCart.currency = currency?.trim().toUpperCase() || siteCurrency(cms.site) || '';
	});

	// The page's language in the business's country, not the browser's
	// settings: on a Mexican site an English page shows MXN as `MX$5.50` and a
	// Spanish one as `$5.50`.
	const pageLocale = () =>
		siteLocale(
			cms.site,
			(typeof document !== 'undefined' && document.documentElement.lang) || undefined
		);

	const target = useFormTarget(() => ({ key, action }));
	setWhatsAppFieldNames(() => ORDER_PLACEHOLDERS);

	let status = $state<FormStatus>('idle');
	let message = $state<string | null>(null);

	const cartState: CmsWhatsAppCartState = {
		get status() {
			return status;
		},
		get message() {
			return message;
		},
		data: null,
		cart: whatsappCart,
		get placed() {
			return whatsappCart.placed;
		},
		formatPrice: (amount) => formatMoney(amount, whatsappCart.currency, pageLocale())
	};

	// The cart lives in the browser, so the server renders it empty and it
	// fills in here.
	onMount(() => whatsappCart.load());

	const field = (body: FormData, name: string) => {
		const value = body.get(name);
		return typeof value === 'string' ? value.trim() : '';
	};

	const record = (order: Order, text: string, gotcha: string) => {
		if (!target.url) {
			status = 'success';
			return;
		}
		status = 'submitting';
		recordOrder(target.url, order, { message: text, token: target.token, gotcha })
			.then(async (res) => {
				status = res.ok ? 'success' : 'failure';
				if (!res.ok) message = ((await res.json().catch(() => null))?.message as string) ?? null;
			})
			.catch(() => {
				status = 'error';
			});
	};

	const submit = (event: SubmitEvent, settings: CmsWhatsAppValue) => {
		event.preventDefault();
		if (cmsStore.isEditing) return;
		message = null;
		if (whatsappCart.items.length === 0) {
			status = 'error';
			message = 'The cart is empty.';
			return;
		}
		const body = new FormData(event.currentTarget as HTMLFormElement, event.submitter);
		if (!whatsappCart.currency) {
			status = 'error';
			message = 'No currency is set.';
			return;
		}
		const lines = whatsappCart.items.map(({ name, quantity, price }) => ({
			name,
			quantity,
			price
		}));
		const order: Order = {
			ref: orderRef(),
			name: field(body, 'name'),
			phone: field(body, 'phone'),
			note: field(body, 'note') || undefined,
			currency: whatsappCart.currency,
			lines,
			subtotal: orderSubtotal(lines, whatsappCart.currency)
		};
		const text = tidyMessage(
			fillMessage(settings.message || DEFAULT_ORDER_MESSAGE, orderPlaceholders(order, pageLocale()))
		);
		const href = whatsappHref(number || settings.number, text);
		if (!href) {
			status = 'error';
			message = 'No WhatsApp number is set.';
			return;
		}
		record(order, text, field(body, '_gotcha'));
		openChat(href);
		whatsappCart.place({ ref: order.ref, href });
	};
</script>

<Structured
	schema={cmsWhatsApp}
	{name}
	{scope}
	{fallback}
	{value}
	view={(settings) => settings}
	editable={() => import('./cms-whatsapp-form-editable.svelte')}
>
	{#snippet children(settings)}
		<form {...rest} method="POST" action={target.url} onsubmit={(event) => submit(event, settings)}>
			<FormControls token={target.token} />
			{@render content(cartState)}
		</form>
	{/snippet}
</Structured>
