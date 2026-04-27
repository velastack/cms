<script lang="ts">
	import { MetaTags, deepMerge } from 'svelte-meta-tags';
	import { CmsRepeater, CmsText } from '$lib/components/cms/index.js';
	import AdminBar from '$lib/components/admin-bar/admin-bar.svelte';
	import { defineNewPages } from '$lib/components/admin-bar/new-page-config.js';
	import { page } from '$app/state';

	type FooterLink = { href: string; label: string };

	let { data, children } = $props();
	let metaTags = $derived(deepMerge(data.baseMetaTags, page.data.pageMetaTags));

	const newPages = defineNewPages([
		{
			type: 'Room',
			routeId: '/(marketing)/rooms/[slug]',
			fields: ['title'],
			transform: ({ title }) => ({
				params: {
					slug: title
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/^-+|-+$/g, '')
				},
				metadata: { title }
			})
		}
	]);
</script>

<AdminBar {newPages} />
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
