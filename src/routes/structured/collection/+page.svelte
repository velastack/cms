<script lang="ts">
	import { CmsCollection, formatCollectionPrice } from '$lib/index.js';
	import { demoCollection } from '../../_components/demo-content.js';
</script>

<h1>CmsCollection</h1>
<p class="lede">
	One list of rooms. The full list below; a featured slice further down reads the same value with <code
		>featured</code
	>
	and <code>limit</code>, so home and list page share one edit.
</p>

<CmsCollection name="rooms" fallback={demoCollection}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as item (item.id)}
				<li class="card">
					{#if item.image?.url}<img src={item.image.url} alt={item.image.alt ?? ''} />{/if}
					<h3>
						{#if item.href}<a href={item.href}>{item.title}</a>{:else}{item.title}{/if}
					</h3>
					<p>{item.summary}</p>
					{#if item.price.amount !== null}<p>
							<strong>{formatCollectionPrice(item.price, 'en-IE')}</strong>
						</p>{/if}
					{#if item.details.length}
						<dl class="rows">
							{#each item.details as d (d.id)}<dt>{d.label}</dt>
								<dd>{d.value}</dd>{/each}
						</dl>
					{/if}
					{#if item.features.length}<p class="muted">{item.features.join(' · ')}</p>{/if}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsCollection>

<h2>Featured, at most two</h2>
<CmsCollection name="rooms" featured limit={2}>
	{#snippet children(items)}
		<p>
			{#each items as item, i (item.id)}{#if i > 0},
				{/if}{item.title}{/each}
		</p>
	{/snippet}
</CmsCollection>
