<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Header from '../_components/header.svelte';

	let { children }: { children: Snippet } = $props();
	const isIndex = $derived(page.url.pathname.replace(/\/$/, '') === '/structured');
</script>

<Header />

<section class="wrap">
	{#if !isIndex}<p class="back"><a href="/structured">← All components</a></p>{/if}
	{@render children()}
</section>

<style>
	.wrap {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
	}
	.back {
		font-size: 0.85rem;
		margin: 0 0 1.5rem;
	}
	.back a {
		color: #555;
	}
	.wrap :global(h1) {
		margin: 0 0 0.5rem;
	}
	.wrap :global(h2) {
		margin: 2rem 0 0.75rem;
		font-size: 1.15rem;
	}
	.wrap :global(.lede) {
		color: #555;
		margin: 0 0 2rem;
	}
	.wrap :global(.cards) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.wrap :global(.card) {
		padding: 1rem;
		border: 1px solid rgba(127, 127, 127, 0.25);
		border-radius: 0.5rem;
		background: white;
	}
	.wrap :global(.card img) {
		width: 100%;
		height: auto;
		border-radius: 0.25rem;
	}
	.wrap :global(.card h3) {
		margin: 0.5rem 0 0.25rem;
		font-size: 1rem;
	}
	.wrap :global(.card p) {
		margin: 0.25rem 0;
		font-size: 0.9rem;
		color: #444;
	}
	.wrap :global(.muted) {
		color: #777;
		font-size: 0.85rem;
	}
	.wrap :global(dl.rows) {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
	}
	.wrap :global(dl.rows dd) {
		margin: 0;
	}
	.wrap :global(pre) {
		padding: 0.75rem;
		background: #f0f0f0;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		overflow: auto;
	}
</style>
