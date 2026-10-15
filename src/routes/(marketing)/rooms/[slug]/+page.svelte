<script lang="ts">
	import {
		cms,
		CmsDateTime,
		CmsGallery,
		CmsImage,
		CmsMarkdown,
		CmsNumber,
		CmsText
	} from '#lib/index.js';
	import Explainer from '../../../_components/explainer.svelte';
	import Marker from '../../../_components/marker.svelte';

	const beds: Record<string, string> = { king: 'King', queen: 'Queen', twin: 'Twin' };
	const bedType = $derived(beds[cms.metadata.bed_type as string] ?? '–');

	const formatTime = (raw: string): string => {
		const m = /^(\d{2}):(\d{2})/.exec(raw);
		if (!m) return raw;
		const h = Number(m[1]);
		return `${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`}${h >= 12 ? 'pm' : 'am'}`;
	};
</script>

<Explainer
	title="A room: one page per entry"
	notes={[
		{
			title: 'The title is metadata',
			body: 'The heading is `metadata.title`, the same value as the page’s SEO title and the name in the rooms list. Edit it once and all three change.',
			component: 'CmsText'
		},
		{
			title: 'Image',
			body: 'Picked from the media library, where uploads go. Alt text is stored with the image.',
			component: 'CmsImage'
		},
		{
			title: 'Numbers and a time',
			body: 'Price and guests are the typed metadata from `page.cms.ts`, rendered with `CmsNumber`. Check-in is a page field rendered with `CmsDateTime` in `time` mode. The bed type is an enum, so it is edited in Page → SEO & Metadata.',
			component: 'CmsNumber'
		},
		{
			title: 'Markdown',
			body: 'For editors who prefer writing Markdown to using a toolbar.',
			component: 'CmsMarkdown'
		},
		{
			title: 'Gallery',
			body: 'Images with captions, edited in a popover.',
			component: 'CmsGallery'
		}
	]}
	beyond={[
		{
			title: 'New rooms start from fallbacks',
			body: 'A room created in the admin bar stores only its title. Every other field shows the room template’s fallback from `content/en.json` until an editor changes it. The Garden Room and the Loft store an explicit empty gallery (`null`), so the sample photos never stand in for theirs.'
		},
		{
			title: 'One document per room',
			body: 'Every room uses this template but stores its content separately, keyed by its `slug` in the `page:/(marketing)/rooms/[slug]` scope.'
		},
		{
			title: 'Deleting a room',
			body: 'Page → Delete Page… asks what the old URL should do: 404, 410 Gone, or redirect to another page.'
		}
	]}
>
	<p>Every room shares this template. Their content is what makes them different.</p>
</Explainer>

<article>
	<header>
		<h1><CmsText name="metadata.title" /> <Marker n={1} /></h1>
		<p class="summary">
			<CmsText name="summary" />
		</p>
	</header>

	<div class="image">
		<Marker n={2} />
		<CmsImage name="hero.image" />
	</div>

	<div class="body">
		<dl class="details">
			<div class="marker"><Marker n={3} /></div>
			<div>
				<dt>From</dt>
				<dd>
					<CmsNumber name="metadata.price_per_night" min={0} integer>
						{#snippet children(amount)}€{amount} / night{/snippet}
					</CmsNumber>
				</dd>
			</div>
			<div>
				<dt>Sleeps</dt>
				<dd><CmsNumber name="metadata.max_guests" min={1} integer /></dd>
			</div>
			<div>
				<dt>Bed</dt>
				<dd>{bedType}</dd>
			</div>
			<div>
				<dt>Check-in from</dt>
				<dd>
					<CmsDateTime name="checkIn" mode="time">
						{#snippet children(value)}{formatTime(value)}{/snippet}
					</CmsDateTime>
				</dd>
			</div>
		</dl>

		<section class="description">
			<Marker n={4} />
			<CmsMarkdown name="description" />
		</section>
	</div>

	<section>
		<Marker n={5} />
		<CmsGallery name="gallery">
			{#snippet children(items)}
				<div class="gallery">
					{#each items as item (item.id)}
						<figure>
							<img src={item.image?.url} alt={item.image?.alt ?? item.caption} />
							<figcaption>{item.caption}</figcaption>
						</figure>
					{/each}
				</div>
			{/snippet}
		</CmsGallery>
	</section>
</article>

<style>
	article {
		max-width: 64rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 3rem;
	}
	h1 {
		margin: 0;
		font-size: 2.75rem;
	}
	.summary {
		margin: 0.5rem 0 1.5rem;
		max-width: 40rem;
		color: var(--muted);
		font-size: 1.125rem;
	}
	.image {
		position: relative;
	}
	.image > :global(.marker) {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
	}
	.image :global(img) {
		display: block;
		width: 100%;
		max-height: 30rem;
		object-fit: cover;
	}
	.body {
		display: grid;
		grid-template-columns: 16rem 1fr;
		gap: 2.5rem;
		margin-top: 2rem;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0;
		padding: 1.25rem;
		background: var(--paper);
		align-self: start;
	}
	.details dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.details dd {
		margin: 0;
		font-size: 1.125rem;
	}
	.description {
		line-height: 1.6;
	}
	.description :global(h2) {
		margin: 0.5rem 0;
		font-size: 1.5rem;
	}
	.description :global(ul) {
		padding-left: 1.25rem;
	}
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 1rem;
		margin-top: 0.5rem;
	}
	figure {
		margin: 0;
	}
	figure img {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
	}
	figcaption {
		margin-top: 0.375rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	section {
		margin-top: 2rem;
	}
	@media (max-width: 40rem) {
		.body {
			grid-template-columns: 1fr;
		}
	}
</style>
