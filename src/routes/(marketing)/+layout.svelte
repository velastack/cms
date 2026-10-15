<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CmsBoolean, CmsText } from '#lib/index.js';
	import Header from '../_components/header.svelte';

	type Props = { children: Snippet };
	let { children }: Props = $props();
</script>

<!-- `(marketing)` layout scope: the announcement and the header tagline are
     stored once for every page in this group. -->
<CmsBoolean name="announcement.visible">
	{#snippet children(visible)}
		{#if visible}
			<aside class="announcement">
				<CmsText name="announcement.text" />
			</aside>
		{/if}
	{/snippet}
</CmsBoolean>

<Header />

{@render children()}

<style>
	.announcement {
		padding: 0.5rem 1.25rem;
		background: var(--sea);
		color: white;
		font-size: 0.875rem;
		text-align: center;
	}
</style>
