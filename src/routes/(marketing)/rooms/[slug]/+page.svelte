<script lang="ts">
	import { page } from '$app/state';
	import {
		CmsDateTime,
		CmsImage,
		CmsMarkdown,
		CmsNumber,
		CmsRepeater,
		CmsText
	} from '$lib/index.js';

	type GalleryItem = { src: string; caption: string };

	const formatTime = (raw: string): string => {
		const m = /^(\d{2}):(\d{2})/.exec(raw);
		if (!m) return raw;
		const h = Number(m[1]);
		const suffix = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 === 0 ? 12 : h % 12;
		return `${h12}:${m[2]} ${suffix}`;
	};
</script>

<article>
	<h1><CmsText name="hero.title" fallback={`Room ${page.params.slug ?? ''}`} /></h1>
	<CmsImage name="hero.image" alt="Hero image" />

	<dl class="details">
		<div>
			<dt>Sleeps</dt>
			<dd><CmsNumber name="details.capacity" fallback={2} min={1} integer /></dd>
		</div>
		<div>
			<dt>Nightly rate</dt>
			<dd>
				<CmsNumber name="details.nightlyRate" fallback={250} min={0} step={1}>
					{#snippet children(amount)}${amount.toLocaleString('en-US')}{/snippet}
				</CmsNumber>
			</dd>
		</div>
		<div>
			<dt>Check-in from</dt>
			<dd>
				<CmsDateTime name="details.checkInFrom" mode="time" fallback="15:00">
					{#snippet children(value)}{formatTime(value)}{/snippet}
				</CmsDateTime>
			</dd>
		</div>
	</dl>

	<section class="description">
		<CmsMarkdown
			name="description"
			fallback={`A bright, comfortable space with a king-size bed and a private balcony.

## Amenities

- High-speed Wi-Fi
- Walk-in shower
- Locally roasted coffee

Need a recommendation? Ask the front desk for our [neighborhood guide](#).`}
		/>
	</section>

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
	.details {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin: 1.5rem 0 0;
		padding: 0;
	}
	.details > div {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.details dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #777;
	}
	.details dd {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 500;
	}
	.description {
		margin-top: 1.5rem;
		line-height: 1.6;
	}
	.description :global(h2) {
		font-size: 1.25rem;
		margin: 1.25rem 0 0.5rem;
	}
	.description :global(ul) {
		padding-left: 1.25rem;
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
