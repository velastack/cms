<script lang="ts" module>
	/** `CmsPricing`: tiers with a feature checklist, formatted in the visitor's locale. */
	export * from '../../core/shapes/pricing.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsStore } from './cms-store.svelte.js';
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
	const locale = $derived(cmsStore.activeLocale || 'en');
</script>

<Structured
	schema={cmsPricing}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsPricingValue) => pricingView(v, locale)}
	{children}
/>
