<script lang="ts">
	import type { Snippet } from 'svelte';
	import Header from '$lib/components/header.svelte';

	type Props = { children: Snippet };
	let { children }: Props = $props();
</script>

<Header />

<div class="app-shell">
	{@render children()}
</div>

<style>
	.app-shell {
		max-width: 64rem;
		margin: 0 auto;
		padding: 2rem 1.25rem;
	}
</style>
