<script lang="ts">
	import type { Snippet } from 'svelte';
	import Header from '../_components/header.svelte';

	type Props = { children: Snippet };
	let { children }: Props = $props();
</script>

<!-- The same Header as the (marketing) layout. Its tagline is stored in this
     layout's scope, so it can say something different here. -->
<div class="portal-header">
	<Header />
</div>

{@render children()}

<style>
	.portal-header {
		background: var(--ink);
		color: white;
	}
	.portal-header :global(.tagline) {
		color: rgba(255, 255, 255, 0.7);
	}
	.portal-header :global(nav a[aria-current='page']) {
		color: white;
	}
</style>
