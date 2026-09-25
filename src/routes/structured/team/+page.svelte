<script lang="ts">
	import { CmsTeam } from '$lib/index.js';
	import { demoTeam } from '../../_components/demo-content.js';
</script>

<h1>CmsTeam</h1>
<p class="lede">Portraits come from the media library; the bio is rich text.</p>

<CmsTeam name="team" fallback={demoTeam}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as m (m.id)}
				<li class="card">
					{#if m.photo?.url}<img src={m.photo.url} alt={m.photo.alt ?? m.name} />{/if}
					<h3>{m.name}</h3>
					<p class="muted">{m.role}</p>
					{@html m.bio}
					{#if m.email}<p><a href={`mailto:${m.email}`}>{m.email}</a></p>{/if}
					{#each m.links as l (l.id)}<p><a href={l.url}>{l.platform}</a></p>{/each}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsTeam>
