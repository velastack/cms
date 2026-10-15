<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		CmsEntries,
		CmsImage,
		CmsLink,
		CmsRichText,
		CmsStats,
		CmsTestimonials,
		CmsText
	} from '#lib/index.js';
	import Explainer from '../_components/explainer.svelte';
	import Marker from '../_components/marker.svelte';

	const eur = (n: unknown) =>
		typeof n === 'number'
			? n.toLocaleString('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
			: '';
</script>

<Explainer
	title="Home: one page, three scopes"
	notes={[
		{
			title: 'Page fields',
			body: 'The hero title, subtitle, image and button are stored in `page:/(marketing)` and appear only on this page. The button can point to a page on the site or to any URL.',
			component: 'CmsLink'
		},
		{
			title: 'Rich text',
			body: 'A block of HTML edited inline with a formatting toolbar.',
			component: 'CmsRichText'
		},
		{
			title: 'Structured list',
			body: 'Figures with a fixed shape, edited in a popover. The template decides the markup.',
			component: 'CmsStats'
		},
		{
			title: 'Pages, listed',
			body: 'Each room is a page of its own under `/rooms/[slug]`. `CmsEntries` lists them with their metadata, so a new room shows up here as soon as it is published.',
			component: 'CmsEntries'
		},
		{
			title: 'Testimonials',
			body: 'Quotes with an author, rating and source. `toReview` turns each one into schema.org data.',
			component: 'CmsTestimonials'
		}
	]}
	beyond={[
		{
			title: 'Layout scopes',
			body: 'The announcement and tagline belong to the `(marketing)` layout, so editing them here changes every marketing page. The name, nav and footer belong to the root layout and are shared by the whole site.'
		},
		{
			title: 'Translations',
			body: 'Preview the page in Spanish from Site → Locales. The hero, nav and announcement are translated; everything else falls back to English. The same panel lists which of your edits still need translating.'
		},
		{
			title: 'SEO',
			body: 'Page → SEO & Metadata edits this page’s title, description and share image. The root layout turns them into meta tags with `toMetaTags`.'
		}
	]}
>
	<p>
		The home page of a small hotel. Everything below the header is content an editor can change in
		place. The numbers mark which CMS component renders each part.
	</p>
</Explainer>

<section class="hero">
	<div class="hero-image"><CmsImage name="hero.image" /></div>
	<div class="hero-copy">
		<Marker n={1} />
		<h1><CmsText name="hero.title" /></h1>
		<p class="subtitle"><CmsText name="hero.subtitle" /></p>
		<CmsLink name="hero.cta" class="btn" />
	</div>
</section>

<div class="wrap">
	<section class="intro">
		<Marker n={2} />
		<CmsRichText name="intro" />
	</section>

	<section>
		<Marker n={3} />
		<CmsStats name="stats">
			{#snippet children(items)}
				<ul class="stats">
					{#each items as s (s.id)}
						<li>
							<strong>{s.value}</strong>
							<span>{s.label}</span>
							{#if s.note}<small>{s.note}</small>{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
		</CmsStats>
	</section>

	<section>
		<h2><CmsText name="rooms.heading" /> <Marker n={4} /></h2>
		<ul class="rooms">
			<CmsEntries routeId="/(marketing)/rooms/[slug]">
				{#snippet children(entry)}
					<li>
						<a href={resolve('/(marketing)/rooms/[slug]', entry.params)}>
							<strong>{entry.metadata.title ?? entry.params.slug}</strong>
							<span>{entry.metadata.description ?? ''}</span>
							<small>From {eur(entry.metadata.price_per_night)} a night</small>
						</a>
					</li>
				{/snippet}
			</CmsEntries>
		</ul>
	</section>

	<section>
		<Marker n={5} />
		<CmsTestimonials name="testimonials">
			{#snippet children(items)}
				<div class="quotes">
					{#each items as t (t.id)}
						<figure>
							{#if t.rating}
								<p class="stars" aria-label={`${t.rating} out of 5`}>{'★'.repeat(t.rating)}</p>
							{/if}
							<blockquote>{@html t.quote}</blockquote>
							<figcaption>
								<strong>{t.author}</strong>{#if t.role}, {t.role}{/if}
								{#if t.source.label}<small>via {t.source.label}</small>{/if}
							</figcaption>
						</figure>
					{/each}
				</div>
			{/snippet}
		</CmsTestimonials>
	</section>
</div>

<style>
	.hero {
		display: grid;
		height: clamp(24rem, 50vw, 34rem);
		margin-top: 0;
		color: white;
	}
	.hero-image,
	.hero-copy {
		grid-area: 1 / 1;
		min-height: 0;
	}
	.hero-image {
		overflow: hidden;
	}
	.hero-image :global(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.hero-copy {
		align-self: end;
		padding: 3rem max(1.25rem, calc((100% - 61.5rem) / 2));
		background: linear-gradient(transparent, rgba(10, 25, 30, 0.7));
	}
	.hero h1 {
		margin: 0.5rem 0;
		font-size: clamp(2rem, 5vw, 3.25rem);
	}
	.subtitle {
		margin: 0 0 1.25rem;
		max-width: 34rem;
		font-size: 1.125rem;
	}
	.hero-copy :global(.btn) {
		display: inline-block;
		padding: 0.625rem 1.25rem;
		border-radius: 999px;
		background: white;
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
	}
	.wrap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 0 1.25rem 3rem;
	}
	section {
		margin-top: 3rem;
	}
	.intro :global(p) {
		max-width: 40rem;
		font-family: var(--serif);
		font-size: 1.375rem;
		line-height: 1.5;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}
	.stats li {
		display: flex;
		flex-direction: column;
		padding: 1.25rem;
		border-top: 2px solid var(--sea);
		background: var(--paper);
	}
	.stats strong {
		font-family: var(--serif);
		font-size: 2rem;
	}
	.stats small {
		color: var(--muted);
	}
	h2 {
		font-size: 1.75rem;
	}
	.rooms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rooms a {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		height: 100%;
		box-sizing: border-box;
		padding: 1.25rem;
		border: 1px solid var(--line);
		background: var(--paper);
		color: inherit;
		text-decoration: none;
	}
	.rooms a:hover {
		border-color: var(--sea);
	}
	.rooms strong {
		font-family: var(--serif);
		font-size: 1.25rem;
	}
	.rooms small {
		color: var(--sea);
		font-weight: 600;
	}
	.quotes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.5rem;
		margin-top: 0.75rem;
	}
	figure {
		margin: 0;
	}
	.stars {
		margin: 0;
		color: #c58b1b;
	}
	blockquote {
		margin: 0.5rem 0;
		font-family: var(--serif);
		font-size: 1.125rem;
		line-height: 1.5;
	}
	blockquote :global(p) {
		margin: 0;
	}
	figcaption small {
		display: block;
		color: var(--muted);
	}
</style>
