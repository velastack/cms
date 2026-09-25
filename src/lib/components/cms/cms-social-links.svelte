<script lang="ts" module>
	/** `CmsSocialLinks`: profile links; the template supplies the icons. */
	export * from '../../core/shapes/social-links.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
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
		children: Snippet<[SocialLinkView[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsSocialLinks}
	{name}
	{scope}
	{fallback}
	{value}
	view={socialLinksView}
	{children}
/>
