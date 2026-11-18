<script lang="ts" module>
	/**
	 * `CmsCompany`: the business's profile, read from the site tree. Headless
	 * and not edited in place: the Company panel edits it, or the host does.
	 */
	export * from '../../core/shapes/company.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cms, cmsStore } from './cms-store.svelte.js';
	import {
		cmsCompany,
		companyView,
		type CmsCompanyValue,
		type CompanyView
	} from '../../core/shapes/company.js';
	import type { HoursLabels } from '../../core/shapes/hours.js';

	type Props = {
		fallback?: Partial<CmsCompanyValue>;
		/** The hours labels: "Closed", "Today", "Open now", "Closed now". */
		labels?: Partial<HoursLabels>;
		children: Snippet<[CompanyView]>;
	};
	let { fallback, labels, children }: Props = $props();

	const view = $derived(
		companyView(
			cmsCompany.read(cms.site.company, fallback as CmsCompanyValue | undefined),
			cmsStore.activeLocale || 'en',
			labels
		)
	);
</script>

{@render children(view)}
