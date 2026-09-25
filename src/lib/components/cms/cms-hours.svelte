<script lang="ts" module>
	/**
	 * `CmsHours`: opening hours, edited in a week grid and rendered from the
	 * derived view (`rows`, `today`, `isOpenNow`) in the visitor's locale.
	 * `isOpenNow` is computed when the page renders; a prerendered page
	 * shows the state at build time.
	 */
	export * from '../../core/shapes/hours.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsStore } from './cms-store.svelte.js';
	import {
		cmsHours,
		hoursView,
		type CmsHoursValue,
		type HoursView
	} from '../../core/shapes/hours.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: Partial<CmsHoursValue>;
		value?: unknown;
		children: Snippet<[HoursView]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
	const locale = $derived(cmsStore.activeLocale || 'en');
</script>

<Structured
	schema={cmsHours}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsHoursValue) => hoursView(v, locale)}
	editable={() => import('./cms-hours-editable.svelte')}
	{children}
/>
