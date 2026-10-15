<script lang="ts">
	import { CmsGallery, CmsImage, CmsRichText, CmsTeam, CmsText, CmsTimeline } from '#lib/index.js';
	import Explainer from '../../_components/explainer.svelte';
	import Marker from '../../_components/marker.svelte';
</script>

<Explainer
	title="About: long-form content"
	notes={[
		{
			title: 'Story',
			body: 'Rich text next to an image. Paragraphs, links and lists all come from the toolbar.',
			component: 'CmsRichText'
		},
		{
			title: 'Timeline',
			body: 'Dated milestones, each with a rich-text body.',
			component: 'CmsTimeline'
		},
		{
			title: 'Team',
			body: 'People with a photo, a role, a rich-text bio and optional contact details.',
			component: 'CmsTeam'
		},
		{
			title: 'Gallery',
			body: 'Images with captions, reorderable in the popover.',
			component: 'CmsGallery'
		}
	]}
	beyond={[
		{
			title: 'Media library',
			body: 'Images you upload land in Site → Media Library, and every image field on the site picks from there. The seeded photos are plain URLs, so the library starts empty.'
		}
	]}
>
	<p>A typical About page, built from four components that each own one part of it.</p>
</Explainer>

<div class="wrap">
	<h1><CmsText name="hero.title" /></h1>

	<section class="story">
		<div class="copy">
			<Marker n={1} />
			<CmsRichText name="story" />
		</div>
		<CmsImage name="storyImage" />
	</section>

	<section>
		<Marker n={2} />
		<CmsTimeline name="history">
			{#snippet children(items)}
				<ol class="timeline">
					{#each items as t (t.id)}
						<li>
							<span class="year">{t.date}</span>
							<div>
								<strong>{t.title}</strong>
								{@html t.body}
							</div>
						</li>
					{/each}
				</ol>
			{/snippet}
		</CmsTimeline>
	</section>

	<section>
		<h2>The team <Marker n={3} /></h2>
		<CmsTeam name="team">
			{#snippet children(members)}
				<ul class="team">
					{#each members as m (m.id)}
						<li>
							{#if m.photo?.url}<img src={m.photo.url} alt={m.photo.alt ?? m.name} />{/if}
							<h3>{m.name}</h3>
							<p class="role">{m.role}</p>
							{@html m.bio}
							{#if m.email}<a href={`mailto:${m.email}`}>{m.email}</a>{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
		</CmsTeam>
	</section>

	<section>
		<Marker n={4} />
		<CmsGallery name="gallery">
			{#snippet children(items)}
				<div class="gallery">
					{#each items as g (g.id)}
						<figure>
							<img src={g.image?.url} alt={g.image?.alt ?? g.caption} />
							<figcaption>{g.caption}</figcaption>
						</figure>
					{/each}
				</div>
			{/snippet}
		</CmsGallery>
	</section>
</div>

<style>
	.wrap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	h1 {
		margin: 1rem 0;
		font-size: 2.75rem;
	}
	h2 {
		font-size: 1.75rem;
	}
	section {
		margin-top: 2.5rem;
	}
	.story {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		align-items: start;
	}
	.copy :global(p) {
		font-family: var(--serif);
		font-size: 1.25rem;
		line-height: 1.55;
	}
	.story :global(.cms-image) {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
	}
	.timeline {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		border-left: 2px solid var(--sea);
	}
	.timeline li {
		display: flex;
		gap: 1.25rem;
		padding: 0 0 1rem 1.25rem;
	}
	.timeline :global(p) {
		margin: 0.125rem 0 0;
		color: var(--muted);
	}
	.year {
		flex: none;
		width: 3.5rem;
		font-family: var(--serif);
		font-size: 1.25rem;
		color: var(--sea);
	}
	.team {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.team img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.team h3 {
		margin: 0.75rem 0 0;
		font-size: 1.25rem;
	}
	.role {
		margin: 0;
		color: var(--sea);
		font-weight: 600;
	}
	.team :global(p) {
		line-height: 1.5;
	}
	.team a {
		color: var(--sea);
		font-size: 0.9rem;
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
	@media (max-width: 40rem) {
		.story {
			grid-template-columns: 1fr;
		}
	}
</style>
