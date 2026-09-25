<script lang="ts" module>
	/** `CmsTestimonials`: quotes with author, rating and source. */
	export * from '../../core/shapes/testimonials.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import {
		cmsTestimonials,
		testimonialsView,
		type CmsTestimonialsValue,
		type Testimonial
	} from '../../core/shapes/testimonials.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?:
			Partial<CmsTestimonialsValue> | Array<Partial<CmsTestimonialsValue['items'][number]>>;
		value?: unknown;
		children: Snippet<[Testimonial[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsTestimonials}
	{name}
	{scope}
	{fallback}
	{value}
	view={testimonialsView}
	{children}
/>
