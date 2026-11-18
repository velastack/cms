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
	import { cms, cmsStore } from './cms-store.svelte.js';
	import { cmsCompany, companyHours } from '../../core/shapes/company.js';
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
		/** Take the hours from the company profile: `true` for the primary
		 * location, or a location id. */
		company?: boolean | string;
		children: Snippet<[HoursView]>;
	};
	let { name, scope, fallback, value, company, children }: Props = $props();
	const locale = $derived(cmsStore.activeLocale || 'en');

	const bound = $derived(
		company && cms.site.company != null
			? companyHours(
					cmsCompany.normalize(cms.site.company),
					typeof company === 'string' ? company : undefined
				)
			: null
	);
</script>

<Structured
	schema={cmsHours}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsHoursValue) => hoursView(bound ? { ...v, ...bound } : v, locale)}
	company={bound !== null}
	editable={() => import('./cms-hours-editable.svelte')}
	{children}
/>
