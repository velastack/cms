<script lang="ts" module>
	/** `CmsNav`: site navigation. Lives in the root layout; other places read it with `scope="root"`. */
	export * from '../../core/shapes/nav.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsNav, navView, type CmsNavValue, type NavItemView } from '../../core/shapes/nav.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsNavValue> | Array<Partial<CmsNavValue['items'][number]>>;
		value?: unknown;
		children: Snippet<[NavItemView[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured schema={cmsNav} {name} {scope} {fallback} {value} view={navView} {children} />
