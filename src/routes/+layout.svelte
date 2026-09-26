<script lang="ts">
	import { MetaTags, deepMerge } from 'svelte-meta-tags';
	import { AdminBar, cms, CmsContact, CmsHours, CmsNav, CmsSocialLinks } from '$lib/index.js';
	import { demoContact, demoFooterNav, demoHours, demoSocial } from './_components/demo-content.js';

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
		<div class="cols">
			<div>
				<CmsHours name="hours" fallback={demoHours}>
					{#snippet children(h)}
						<p class="today">
							<strong>{h.today.label}:</strong>
							{h.today.text}
							<span class="status" data-open={h.isOpenNow}>{h.status}</span>
						</p>
					{/snippet}
				</CmsHours>
				<CmsContact name="contact" fallback={demoContact}>
					{#snippet children(c)}
						<p class="contact">
							{#if c.telHref}<a href={c.telHref}>{c.phones[0].number}</a>{/if}
							{#if c.mailto}<a href={c.mailto}>{c.emails[0].address}</a>{/if}
						</p>
					{/snippet}
				</CmsContact>
			</div>
			<div class="right">
				<CmsSocialLinks name="social" fallback={demoSocial}>
					{#snippet children(items)}
						<p class="social">
							{#each items as item (item.id)}
								<a href={item.url} rel="me noopener" target="_blank">{item.name}</a>
							{/each}
						</p>
					{/snippet}
				</CmsSocialLinks>
				<CmsNav name="nav.footer" fallback={demoFooterNav}>
					{#snippet children(items)}
						<small>
							{#each items as item, i (item.id)}
								{#if i > 0}<span class="sep"> · </span>{/if}
								<a href={item.href} target={item.newTab ? '_blank' : undefined}>{item.label}</a>
							{/each}
						</small>
					{/snippet}
				</CmsNav>
			</div>
		</div>
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
		padding: 1.25rem;
		border-top: 1px solid rgba(127, 127, 127, 0.25);
		color: #555;
		font-size: 0.9rem;
	}
	.cols {
		max-width: 56rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem 2rem;
	}
	.right {
		text-align: right;
	}
	.footer p {
		margin: 0 0 0.375rem;
	}
	.footer a {
		color: inherit;
	}
	.contact a,
	.social a {
		margin-right: 0.75rem;
	}
	.right a {
		margin: 0 0 0 0.75rem;
	}
	.status {
		margin-left: 0.5rem;
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		background: rgba(127, 127, 127, 0.12);
	}
	.status[data-open='true'] {
		background: #e6f7ec;
		color: #176638;
	}
	.sep {
		color: rgba(127, 127, 127, 0.6);
	}
</style>
