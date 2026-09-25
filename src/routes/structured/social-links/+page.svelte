<script lang="ts">
	import { CmsSocialLinks } from '$lib/index.js';
	import { demoSocial } from '../../_components/demo-content.js';
</script>

<h1>CmsSocialLinks</h1>
<p class="lede">
	Profiles from the root layout. The template maps <code>platform</code> to its own icon set;
	<code>name</code> is the label or the platform's name.
</p>

<CmsSocialLinks name="social" scope="root" fallback={demoSocial}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as item (item.id)}
				<li class="card">
					<h3>{item.name}</h3>
					<p class="muted">{item.platform}</p>
					<p><a href={item.url} target="_blank" rel="me noopener">{item.url}</a></p>
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsSocialLinks>
