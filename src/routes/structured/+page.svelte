<script lang="ts">
	import { CmsText } from '$lib/index.js';
	import DemoHours from '../_components/demo-hours.svelte';
</script>

<section class="wrap">
	<h1><CmsText name="structured.title" fallback="Structured editing" /></h1>
	<p>
		Business name from the root layout, edited from this page through
		<code>scope="root"</code>:
		<strong><CmsText name="branding.name" scope="root" fallback="Velastack CMS" /></strong>
	</p>

	<h2>Opening hours</h2>
	<DemoHours
		name="hours"
		scope="root"
		fallback={{
			v: 1,
			note: 'Closed on public holidays',
			days: [
				{ id: 'mon', label: 'Monday', open: '09:00', close: '17:00' },
				{ id: 'sat', label: 'Saturday', open: '10:00', close: '14:00' }
			]
		}}
	>
		{#snippet children(hours)}
			<dl class="hours">
				{#each hours.days as day (day.id)}
					<dt>{day.label}</dt>
					<dd>{day.open} – {day.close}</dd>
				{/each}
			</dl>
			{#if hours.note}<p class="note">{hours.note}</p>{/if}
		{/snippet}
	</DemoHours>
</section>

<style>
	.wrap {
		max-width: 56rem;
		margin: 0 auto;
		padding: 3rem 1.25rem;
	}
	.hours {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
	}
	.hours dd {
		margin: 0;
	}
	.note {
		color: #555;
		font-size: 0.9rem;
	}
</style>
