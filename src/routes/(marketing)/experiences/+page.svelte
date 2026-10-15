<script lang="ts">
	import {
		CmsCollection,
		CmsPricing,
		CmsRichText,
		CmsSchedule,
		CmsText,
		formatCollectionPrice,
		scheduleByDay
	} from '#lib/index.js';
	import Explainer from '../../_components/explainer.svelte';
	import Marker from '../../_components/marker.svelte';
</script>

<Explainer
	title="Experiences: lists that aren’t pages"
	notes={[
		{
			title: 'A collection',
			body: 'Unlike rooms, experiences don’t get their own URLs. They are items in one value, each with an image, price, duration and tags, edited in a popover with reordering.',
			component: 'CmsCollection'
		},
		{
			title: 'A weekly schedule',
			body: 'Recurring events. `scheduleByDay` groups them for the template.',
			component: 'CmsSchedule'
		},
		{
			title: 'Price tiers',
			body: 'Each tier has a feature checklist, an optional badge and a button. A tier with a custom price shows “Ask us” instead.',
			component: 'CmsPricing'
		}
	]}
	beyond={[
		{
			title: 'Page or collection?',
			body: 'Use a creatable page when each item needs its own URL and SEO. Use a collection when the items only appear inside a list.'
		}
	]}
>
	<p>
		Three structured components on one page. Each one stores a single value, opens a form in a
		popover, and passes typed data to markup the template controls.
	</p>
</Explainer>

<div class="wrap">
	<h1><CmsText name="intro.title" /></h1>
	<div class="lede"><CmsRichText name="intro.body" /></div>

	<section>
		<Marker n={1} />
		<CmsCollection name="experiences">
			{#snippet children(items)}
				<ul class="cards">
					{#each items as item (item.id)}
						<li class:featured={item.featured}>
							{#if item.image?.url}<img src={item.image.url} alt={item.image.alt ?? ''} />{/if}
							<div class="card-body">
								<h2>{item.title}</h2>
								<p>{item.summary}</p>
								<p class="meta">
									{#if item.price.amount !== null}{formatCollectionPrice(item.price, 'en-IE')}{/if}
									{#each item.details as d (d.id)}{d.value}{/each}
									{#if item.duration}<span>{item.duration}</span>{/if}
								</p>
							</div>
						</li>
					{/each}
				</ul>
			{/snippet}
		</CmsCollection>
	</section>

	<section>
		<h2><CmsText name="weekly.heading" /> <Marker n={2} /></h2>
		<CmsSchedule name="weekly">
			{#snippet children(items)}
				<div class="week">
					{#each scheduleByDay({ v: 1, items }) as day (day.day)}
						<div>
							<h3>{day.day}</h3>
							{#each day.items as s (s.id)}
								<p><strong>{s.time}</strong> {s.title} <small>{s.location}</small></p>
							{/each}
						</div>
					{/each}
				</div>
			{/snippet}
		</CmsSchedule>
	</section>

	<section>
		<h2><CmsText name="packages.heading" /> <Marker n={3} /></h2>
		<CmsPricing name="packages">
			{#snippet children(tiers)}
				<ul class="tiers">
					{#each tiers as tier (tier.id)}
						<li class:highlighted={tier.highlighted}>
							{#if tier.badge}<p class="badge">{tier.badge}</p>{/if}
							<h3>{tier.name}</h3>
							<p class="price">{tier.priceText}</p>
							<p>{tier.description}</p>
							<ul class="features">
								{#each tier.features as f (f.id)}
									<li class:excluded={!f.included}>{f.text}</li>
								{/each}
							</ul>
							{#if tier.href}<a class="btn" href={tier.href}>{tier.cta?.label || 'Enquire'}</a>{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
		</CmsPricing>
	</section>
</div>

<style>
	.wrap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	h1 {
		margin: 1rem 0 0.25rem;
		font-size: 2.5rem;
	}
	.lede {
		color: var(--muted);
		font-size: 1.125rem;
	}
	section {
		margin-top: 2.5rem;
	}
	h2 {
		font-size: 1.75rem;
	}
	.cards,
	.tiers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 1.25rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.cards li {
		background: var(--paper);
		border: 1px solid var(--line);
	}
	.cards li.featured {
		border-color: var(--sea);
	}
	.cards img {
		display: block;
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
	}
	.card-body {
		padding: 1rem 1.25rem 1.25rem;
	}
	.card-body h2 {
		margin: 0 0 0.25rem;
		font-size: 1.25rem;
	}
	.card-body p {
		margin: 0 0 0.5rem;
		line-height: 1.5;
	}
	.meta {
		display: flex;
		gap: 1rem;
		color: var(--sea);
		font-weight: 600;
		font-size: 0.9rem;
	}
	.meta span {
		color: var(--muted);
		font-weight: 400;
	}
	.week {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 1rem;
	}
	.week h3 {
		margin: 0 0 0.25rem;
		font-size: 1.125rem;
	}
	.week p {
		margin: 0;
	}
	.week small {
		color: var(--muted);
	}
	.tiers > li {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
		background: var(--paper);
		border: 1px solid var(--line);
	}
	.tiers > li.highlighted {
		border: 2px solid var(--sea);
	}
	.tiers h3 {
		margin: 0;
		font-size: 1.25rem;
	}
	.badge {
		align-self: flex-start;
		margin: 0 0 0.5rem;
		padding: 0.125rem 0.625rem;
		border-radius: 999px;
		background: var(--sea);
		color: white;
		font-size: 0.75rem;
	}
	.price {
		margin: 0.25rem 0;
		font-family: var(--serif);
		font-size: 1.75rem;
	}
	.features {
		flex: 1;
		margin: 0 0 1rem;
		padding-left: 1.25rem;
	}
	.features .excluded {
		color: var(--muted);
		text-decoration: line-through;
	}
	.btn {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		background: var(--ink);
		color: white;
		text-decoration: none;
	}
</style>
