<script lang="ts" module>
	/** `CmsPricing`: tiers with a feature checklist, formatted in the visitor's locale. */
	export * from '../../core/shapes/pricing.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cms, cmsStore } from './cms-store.svelte.js';
	import { siteCurrency, siteLocale } from '../../core/site-currency.js';
	import {
		cmsPricing,
		pricingView,
		type CmsPricingValue,
		type PricingTierView
	} from '../../core/shapes/pricing.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: CmsPricingValue;
		value?: unknown;
		children: Snippet<[PricingTierView[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
	// The page's language in the business's country, and the site's currency
	// unless the block sets one of its own.
	const locale = $derived(siteLocale(cms.site, cmsStore.activeLocale || 'en') ?? 'en');
	const currency = $derived(siteCurrency(cms.site));
</script>

<Structured
	schema={cmsPricing}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsPricingValue) => pricingView(v, locale, currency)}
	{children}
/>
