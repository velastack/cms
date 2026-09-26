<script lang="ts" module>
	/** `CmsFaq`: questions and rich answers. */
	export * from '../../core/shapes/faq.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsFaq, faqView, type CmsFaqValue, type FaqItem } from '../../core/shapes/faq.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsFaqValue> | Array<Partial<CmsFaqValue['items'][number]>>;
		value?: unknown;
		children: Snippet<[FaqItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured schema={cmsFaq} {name} {scope} {fallback} {value} view={faqView} {children} />
