<script lang="ts">
	import { page } from '$app/state';
	import { CmsImage, CmsRepeater, CmsText } from '$lib/components/cms/index.js';

	type GalleryItem = { src: string; caption: string };
</script>

<article>
	<h1><CmsText name="hero.title" fallback={`Room ${page.params.slug ?? ''}`} /></h1>
	<CmsImage name="hero.image" alt="Hero image" />

	<section class="gallery">
		<CmsRepeater name="gallery.items">
			{#snippet children(item: GalleryItem)}
				<figure>
					<CmsImage name="src" value={item.src} alt={item.caption} />
					<figcaption><CmsText name="caption" value={item.caption} /></figcaption>
				</figure>
			{/snippet}
		</CmsRepeater>
	</section>
</article>

<style>
	article {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1rem;
		margin-top: 1.5rem;
	}
	figure {
		margin: 0;
	}
	figcaption {
		font-size: 0.9rem;
		color: #555;
		margin-top: 0.25rem;
	}
</style>
