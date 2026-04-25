<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CmsRepeater, CmsText } from '$lib/components/cms/index.js';

	type Props = { children: Snippet };
	let { children }: Props = $props();

	type FooterLink = { href: string; label: string };
</script>

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
