<script lang="ts">
	import { CmsHours, toOpeningHoursSpecification } from '$lib/index.js';
	import { demoHours } from '../../_components/demo-content.js';
</script>

<h1>CmsHours</h1>
<p class="lede">
	The footer owns the hours; this page reads the same value with <code>scope="root"</code> and renders
	the full week. Day names and times follow the visitor's locale.
</p>

<CmsHours name="hours" scope="root" fallback={demoHours}>
	{#snippet children(h)}
		<p>
			<strong>{h.today.label} ({h.today.day}):</strong>
			{h.today.text}
			<span class="muted">· {h.status}</span>
			{#if h.today.exception}<span class="muted">· {h.today.exception.label}</span>{/if}
		</p>
		<dl class="rows">
			{#each h.rows as row (row.id)}
				<dt>{row.days}</dt>
				<dd class:muted={row.closed}>{row.text}</dd>
			{/each}
		</dl>
		{#if h.exceptionRows.length}
			<h2>Exceptions</h2>
			<dl class="rows">
				{#each h.exceptionRows as e (e.id)}
					<dt>{e.dateText}</dt>
					<dd>{e.label}{e.label ? ' · ' : ''}{e.text}</dd>
				{/each}
			</dl>
		{/if}
		{#if h.note}<p class="muted">{h.note}</p>{/if}
		<h2>openingHoursSpecification</h2>
		<pre>{JSON.stringify(toOpeningHoursSpecification(h), null, 2)}</pre>
	{/snippet}
</CmsHours>
