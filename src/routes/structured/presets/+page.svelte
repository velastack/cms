<script lang="ts">
	import {
		CmsGallery,
		CmsLogos,
		CmsSchedule,
		CmsStats,
		CmsSteps,
		CmsTimeline,
		scheduleByDay
	} from '$lib/index.js';
	import {
		demoGallery,
		demoLogos,
		demoSchedule,
		demoStats,
		demoSteps,
		demoTimeline
	} from '../../_components/demo-content.js';
</script>

<h1>List presets</h1>
<p class="lede">
	Six fixed item shapes behind exported components. A shape outside these is a new preset, not a
	template schema.
</p>

<h2>CmsStats</h2>
<CmsStats name="stats" fallback={demoStats}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as s (s.id)}
				<li class="card">
					<h3>{s.value}</h3>
					<p>{s.label}</p>
					{#if s.note}<p class="muted">{s.note}</p>{/if}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsStats>

<h2>CmsSteps</h2>
<CmsSteps name="steps" fallback={demoSteps}>
	{#snippet children(items)}
		<ol>
			{#each items as s (s.id)}<li><strong>{s.title}</strong>{@html s.body}</li>{/each}
		</ol>
	{/snippet}
</CmsSteps>

<h2>CmsTimeline</h2>
<CmsTimeline name="timeline" fallback={demoTimeline}>
	{#snippet children(items)}
		<dl class="rows">
			{#each items as t (t.id)}<dt>{t.date}</dt>
				<dd><strong>{t.title}</strong>{@html t.body}</dd>{/each}
		</dl>
	{/snippet}
</CmsTimeline>

<h2>CmsGallery</h2>
<CmsGallery name="gallery" fallback={demoGallery}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as g (g.id)}
				<li class="card">
					<img src={g.image?.url} alt={g.image?.alt ?? g.caption} />
					<p class="muted">{g.caption}</p>
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsGallery>

<h2>CmsLogos</h2>
<CmsLogos name="logos" fallback={demoLogos}>
	{#snippet children(items)}
		<ul class="cards">
			{#each items as l (l.id)}
				<li class="card">
					{#if l.href}<a href={l.href}><img src={l.image?.url} alt={l.name} /></a>{:else}<img
							src={l.image?.url}
							alt={l.name}
						/>{/if}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsLogos>

<h2>CmsSchedule</h2>
<CmsSchedule name="schedule" fallback={demoSchedule}>
	{#snippet children(items)}
		{#each scheduleByDay({ v: 1, items }) as day (day.day)}
			<h3>{day.day}</h3>
			<dl class="rows">
				{#each day.items as s (s.id)}<dt>{s.time}</dt>
					<dd>
						<strong>{s.title}</strong>{#if s.location}
							· {s.location}{/if}{@html s.body}
					</dd>{/each}
			</dl>
		{/each}
	{/snippet}
</CmsSchedule>
