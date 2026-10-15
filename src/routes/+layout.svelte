<script lang="ts">
	import { MetaTags, deepMerge } from 'svelte-meta-tags';
	import {
		AdminBar,
		cms,
		CmsContact,
		CmsHours,
		CmsNav,
		CmsSocialLinks,
		toMetaTags
	} from '#lib/index.js';

	let { data, children } = $props();
	const siteName = $derived(
		(cms.docs['layout:/']?.branding as { name?: string } | undefined)?.name
	);
	let metaTags = $derived(deepMerge(data.baseMetaTags, toMetaTags(cms.metadata, { siteName })));
</script>

{#if data.editable}
	<AdminBar />
{/if}
<MetaTags {...metaTags} />

<div class="root">
	<main>
		{@render children()}
	</main>

	<!-- Root layout scope: every page shares these values, and pages that show
	     the same `name` with `scope="root"` edit the same value. -->
	<footer class="footer">
		<div class="cols">
			<div>
				<CmsHours name="hours">
					{#snippet children(h)}
						<p>
							<strong>Reception {h.today.label.toLowerCase()}:</strong>
							{h.today.text}
							<span class="status" data-open={h.isOpenNow}>{h.status}</span>
						</p>
					{/snippet}
				</CmsHours>
				<CmsContact name="contact">
					{#snippet children(c)}
						<p>{c.formattedAddress.join(', ')}</p>
						<p class="links">
							{#if c.telHref}<a href={c.telHref}>{c.phones[0].number}</a>{/if}
							{#if c.mailto}<a href={c.mailto}>{c.emails[0].address}</a>{/if}
						</p>
					{/snippet}
				</CmsContact>
			</div>
			<div class="right">
				<CmsSocialLinks name="social">
					{#snippet children(items)}
						<p class="links">
							{#each items as item (item.id)}
								<a href={item.url} rel="me noopener" target="_blank">{item.name}</a>
							{/each}
						</p>
					{/snippet}
				</CmsSocialLinks>
				<CmsNav name="nav.footer">
					{#snippet children(items)}
						<p class="links">
							{#each items as item (item.id)}
								<a href={item.href} target={item.newTab ? '_blank' : undefined}>{item.label}</a>
							{/each}
						</p>
					{/snippet}
				</CmsNav>
				<p class="credit">A demo site for <a href="/playground">@velastack/cms</a></p>
			</div>
		</div>
	</footer>
</div>

<style>
	:global(:root) {
		--serif: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
		--sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		--mono: ui-monospace, SFMono-Regular, Menlo, monospace;
		--ink: #1d2a30;
		--muted: #5d6b70;
		--sand: #f7f3ec;
		--paper: #fffdf9;
		--sea: #1f6672;
		--line: rgba(29, 42, 48, 0.12);
		/* The explainer's annotation layer, deliberately unlike the hotel. */
		--note: #3446c8;
		--note-ink: #1e2550;
		--note-bg: #eef0fd;
		--note-line: rgba(52, 70, 200, 0.25);
	}
	:global(body) {
		margin: 0;
		font-family: var(--sans);
		color: var(--ink);
		background: var(--sand);
	}
	:global(h1, h2, h3) {
		font-family: var(--serif);
		font-weight: 600;
	}
	:global(img) {
		max-width: 100%;
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
		padding: 2rem 1.25rem;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.9rem;
	}
	.cols {
		max-width: 64rem;
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
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}
	.right .links {
		justify-content: flex-end;
	}
	.status {
		margin-left: 0.5rem;
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		background: rgba(127, 127, 127, 0.12);
	}
	.status[data-open='true'] {
		background: #e6f2ec;
		color: #1d6b45;
	}
	.credit {
		font-size: 0.8rem;
	}
	@media (max-width: 40rem) {
		.right {
			text-align: left;
		}
		.right .links {
			justify-content: flex-start;
		}
	}
</style>
