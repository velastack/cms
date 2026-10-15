<script lang="ts">
	import { CmsDateTime, CmsLink, CmsMarkdown, CmsRichText, CmsText } from '#lib/index.js';
	import Explainer from '../../_components/explainer.svelte';
	import Marker from '../../_components/marker.svelte';
</script>

<Explainer
	title="Guest portal: same component, different scope"
	notes={[
		{
			title: 'Practical details',
			body: 'Plain text fields for the Wi-Fi details and breakfast, and a time for checkout.',
			component: 'CmsDateTime'
		},
		{
			title: 'House rules',
			body: 'A Markdown list.',
			component: 'CmsMarkdown'
		},
		{
			title: 'A link to anywhere',
			body: 'This button points to an outside URL (WhatsApp) rather than a page on the site.',
			component: 'CmsLink'
		}
	]}
	beyond={[
		{
			title: 'Scope-aware header',
			body: 'The header is the same component file as on the marketing pages. Its tagline has no `scope` prop, so it is stored per layout: `layout:/(guest)` here and `layout:/(marketing)` there. Edit it here and the marketing pages keep theirs. The name and nav use `scope="root"`, so they stay shared.'
		},
		{
			title: 'Hidden from search',
			body: 'This page’s metadata sets `noindex`, so `toMetaTags` adds a robots tag. Toggle it in Page → SEO & Metadata.'
		}
	]}
>
	<p>
		A different section of the site with its own layout, as an app or members area would have. The
		CMS works out which layout a field belongs to from where its component is mounted, with no
		configuration.
	</p>
</Explainer>

<div class="wrap">
	<h1><CmsText name="welcome.title" /></h1>
	<div class="lede"><CmsRichText name="welcome.body" /></div>

	<section class="cards">
		<Marker n={1} />
		<dl>
			<div>
				<dt>Wi-Fi network</dt>
				<dd><CmsText name="wifi.network" /></dd>
			</div>
			<div>
				<dt>Password</dt>
				<dd><code><CmsText name="wifi.password" /></code></dd>
			</div>
			<div>
				<dt>Breakfast</dt>
				<dd><CmsText name="breakfast" /></dd>
			</div>
			<div>
				<dt>Checkout by</dt>
				<dd><CmsDateTime name="checkout" mode="time" /></dd>
			</div>
		</dl>
	</section>

	<section>
		<h2>House rules <Marker n={2} /></h2>
		<CmsMarkdown name="rules" />
	</section>

	<section>
		<Marker n={3} />
		<CmsLink name="dinner" class="btn" />
	</section>
</div>

<style>
	.wrap {
		max-width: 48rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	h1 {
		margin: 1rem 0 0.25rem;
		font-size: 2.25rem;
	}
	.lede {
		color: var(--muted);
	}
	section {
		margin-top: 2rem;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
		margin: 0.5rem 0 0;
	}
	dl div {
		padding: 1rem;
		background: var(--paper);
		border: 1px solid var(--line);
	}
	dt {
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	dd {
		margin: 0.25rem 0 0;
		font-size: 1.125rem;
	}
	code {
		font-family: var(--mono);
	}
	h2 {
		font-size: 1.5rem;
	}
	section :global(ul) {
		padding-left: 1.25rem;
		line-height: 1.6;
	}
	section :global(.btn) {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: 999px;
		background: var(--sea);
		color: white;
		text-decoration: none;
		font-weight: 600;
	}
</style>
