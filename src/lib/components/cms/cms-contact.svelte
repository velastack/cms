<script lang="ts" module>
	/** `CmsContact`: address, phones, emails and the links a template renders from them. */
	export * from '../../core/shapes/contact.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cms } from './cms-store.svelte.js';
	import { cmsCompany, companyContact } from '../../core/shapes/company.js';
	import {
		cmsContact,
		contactView,
		type CmsContactValue,
		type ContactView
	} from '../../core/shapes/contact.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: Partial<CmsContactValue>;
		value?: unknown;
		/** Take name, address and contact details from the company profile:
		 * `true` for the primary location, or a location id. */
		company?: boolean | string;
		children: Snippet<[ContactView]>;
	};
	let { name, scope, fallback, value, company, children }: Props = $props();

	const bound = $derived(
		company && cms.site.company != null
			? companyContact(
					cmsCompany.normalize(cms.site.company),
					typeof company === 'string' ? company : undefined
				)
			: null
	);
</script>

<Structured
	schema={cmsContact}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsContactValue) => contactView(bound ? { ...v, ...bound } : v)}
	company={bound !== null}
	{children}
/>
