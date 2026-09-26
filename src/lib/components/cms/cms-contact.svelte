<script lang="ts" module>
	/** `CmsContact`: address, phones, emails and the links a template renders from them. */
	export * from '../../core/shapes/contact.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
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
		children: Snippet<[ContactView]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured schema={cmsContact} {name} {scope} {fallback} {value} view={contactView} {children} />
