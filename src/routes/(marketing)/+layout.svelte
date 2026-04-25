<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CmsText } from '$lib/components/cms/index.js';
	import Header from '$lib/components/header.svelte';

	type Props = { children: Snippet };
	let { children }: Props = $props();
</script>

<Header />

<aside class="announcement">
	<CmsText name="announcement.text" fallback="Fallback announcement text" />
</aside>

{@render children()}

<style>
	.announcement {
		padding: 0.5rem 1.25rem;
		background: #fff5d6;
		border-bottom: 1px solid rgba(127, 127, 127, 0.25);
		font-size: 0.9rem;
		text-align: center;
	}
</style>
