<script lang="ts">
	import { CmsTestimonials, toReview } from '$lib/index.js';
	import { demoTestimonials } from '../../_components/demo-content.js';
</script>

<h1>CmsTestimonials</h1>
<p class="lede">Rating, source and date make each quote a Review node.</p>

<CmsTestimonials name="testimonials" fallback={demoTestimonials}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as t (t.id)}
				<li class="card">
					{#if t.rating}<p aria-label={`${t.rating} of 5`}>
							{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}
						</p>{/if}
					<blockquote>{@html t.quote}</blockquote>
					<p>
						<strong>{t.author}</strong>{#if t.role}, {t.role}{/if}
					</p>
					{#if t.source.label}<p class="muted">
							via {#if t.source.url}<a href={t.source.url}>{t.source.label}</a>{:else}{t.source
									.label}{/if}
						</p>{/if}
				</li>
			{/each}
		</ul>
		<h2>Review nodes</h2>
		<pre>{JSON.stringify(
				items.map((t) => toReview(t)),
				null,
				2
			)}</pre>
	{/snippet}
</CmsTestimonials>
