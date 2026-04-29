<script lang="ts">
	import { MetaTags, deepMerge } from 'svelte-meta-tags';
	import { CmsRepeater, CmsText } from '$lib/index.js';
	import { AdminBar, cms } from '$lib/index.js';

	type FooterLink = { href: string; label: string };

	let { data, children } = $props();
	let metaTags = $derived(deepMerge(data.baseMetaTags, cms.metadata));
</script>

<AdminBar />
<MetaTags {...metaTags} />

<div class="root">
	<main>
		{@render children()}
	</main>

	<footer class="footer">
		<small>
			<CmsRepeater name="footer.links">
				{#snippet children(item: FooterLink, i: number)}
					{#if i > 0}<span class="sep"> · </span>{/if}
					<a href={item.href}><CmsText name="label" value={item.label} /></a>
				{/snippet}
			</CmsRepeater>
		</small>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		color: #1d1d1f;
		background: #fafafa;
	}
	.root {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	main {
		flex: 1;
	}
	.footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid rgba(127, 127, 127, 0.25);
		text-align: center;
		color: #555;
	}
	.footer a {
		color: inherit;
	}
	.sep {
		color: rgba(127, 127, 127, 0.6);
	}
</style>
