<script lang="ts" module>
	/** `CmsSocialLinks`: profile links; the template supplies the icons. */
	export * from '../../core/shapes/social-links.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cms } from './cms-store.svelte.js';
	import { cmsCompany, companySocial } from '../../core/shapes/company.js';
	import {
		cmsSocialLinks,
		socialLinksView,
		type CmsSocialLinksValue,
		type SocialLinkView
	} from '../../core/shapes/social-links.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsSocialLinksValue> | Array<Partial<CmsSocialLinksValue['items'][number]>>;
		value?: unknown;
		/** Take the profiles from the company profile. */
		company?: boolean;
		children: Snippet<[SocialLinkView[]]>;
	};
	let { name, scope, fallback, value, company, children }: Props = $props();

	const bound = $derived(
		company && cms.site.company != null
			? companySocial(cmsCompany.normalize(cms.site.company))
			: null
	);
</script>

<Structured
	schema={cmsSocialLinks}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsSocialLinksValue) => socialLinksView(bound ? { v: 1, items: bound } : v)}
	company={bound !== null}
	{children}
/>
