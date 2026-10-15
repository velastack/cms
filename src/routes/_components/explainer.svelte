<!--
	The demo's own annotation, not part of the hotel site: what this page shows
	and how to try it. Each of `notes` is numbered to match a <Marker n={…} />
	placed next to the region it describes; `beyond` covers what has no region
	on the page (the shared header, admin-bar panels). `body` may wrap code in
	backticks.
-->
<script module lang="ts">
	export type Note = {
		title: string;
		body: string;
		/** Component name; links to its entry in the playground. */
		component?: string;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import Marker from './marker.svelte';

	type Props = { title: string; notes: Note[]; beyond?: Note[]; children: Snippet };
	let { title, notes, beyond = [], children }: Props = $props();

	const editable = $derived(page.data.editable === true);
	const parts = (body: string) => body.split('`');
</script>

{#snippet body(note: Note)}
	<div>
		<strong>{note.title}</strong>
		<p>
			{#each parts(note.body) as part, j (j)}{#if j % 2}<code>{part}</code>{:else}{part}{/if}{/each}
			{#if note.component}
				<a href={`/playground#${note.component}`}>{note.component} in the playground</a>
			{/if}
		</p>
	</div>
{/snippet}

<aside class="explainer" aria-label="About this demo page">
	<div class="inner">
		<p class="eyebrow">How this page works</p>
		<h2>{title}</h2>
		<div class="intro">{@render children()}</div>

		<ol class="notes">
			{#each notes as note, i (note.title)}
				<li>
					<Marker n={i + 1} />
					{@render body(note)}
				</li>
			{/each}
		</ol>

		{#if beyond.length}
			<p class="eyebrow">Beyond this page</p>
			<ul class="notes">
				{#each beyond as note (note.title)}
					<li>
						<span class="dot" aria-hidden="true"></span>
						{@render body(note)}
					</li>
				{/each}
			</ul>
		{/if}

		<p class="try">
			{#if editable && dev}
				<strong>Try it:</strong> sign in from the admin bar with <code>demo@example.com</code> /
				<code>demo</code>, then choose <strong>Page → Edit</strong> (⌘E).
			{:else if editable}
				<strong>Try it:</strong> sign in from the admin bar, then choose
				<strong>Page → Edit</strong> (⌘E).
			{:else}
				<strong>This copy is read-only.</strong> Clone the repo and run <code>npm run dev</code> to edit
				it with a local CMS backend.
			{/if}
		</p>
	</div>
</aside>

<style>
	.explainer {
		background: var(--note-bg);
		border-bottom: 1px solid var(--note-line);
		color: var(--note-ink);
		font-family: var(--sans);
	}
	.inner {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem;
	}
	.eyebrow {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--note);
	}
	h2 {
		margin: 0.25rem 0 0.5rem;
		font-family: var(--sans);
		font-size: 1.25rem;
	}
	.intro :global(p) {
		margin: 0 0 1rem;
		max-width: 46rem;
		line-height: 1.55;
	}
	.eyebrow + .notes {
		margin-top: 0.5rem;
	}
	.notes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.75rem 1.5rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}
	.notes li {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
	}
	.dot {
		flex: none;
		width: 0.625rem;
		height: 0.625rem;
		margin: 0.375rem 0.375rem 0;
		border: 2px solid var(--note);
		border-radius: 999px;
	}
	.notes p {
		margin: 0.125rem 0 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.notes a {
		color: var(--note);
		white-space: nowrap;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		padding: 0.05rem 0.3rem;
		border-radius: 0.25rem;
		background: rgba(52, 70, 200, 0.08);
	}
	.try {
		margin: 0;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--note-line);
		font-size: 0.9rem;
	}
</style>
