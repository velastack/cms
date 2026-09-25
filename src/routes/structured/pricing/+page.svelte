<script lang="ts">
	import { CmsPricing } from '$lib/index.js';
	import { demoPricing } from '../../_components/demo-content.js';
</script>

<h1>CmsPricing</h1>
<p class="lede">
	Amounts are formatted in the visitor's locale; a custom price shows the editable label.
</p>

<CmsPricing name="pricing" fallback={demoPricing}>
	{#snippet children(tiers)}
		<ul class="cards">
			{#each tiers as tier (tier.id)}
				<li class="card" style:outline={tier.highlighted ? '2px solid #1f2937' : undefined}>
					{#if tier.badge}<p class="muted">{tier.badge}</p>{/if}
					<h3>{tier.name}</h3>
					<p><strong>{tier.priceText}</strong></p>
					<p>{tier.description}</p>
					<ul>
						{#each tier.features as f (f.id)}
							<li style:text-decoration={f.included ? undefined : 'line-through'}>{f.text}</li>
						{/each}
					</ul>
					{#if tier.href}<p><a href={tier.href}>{tier.cta?.label || 'Book'}</a></p>{/if}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsPricing>
