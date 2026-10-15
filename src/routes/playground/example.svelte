<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { id: string; title: string; description: Snippet; children: Snippet };
	let { id, title, description, children }: Props = $props();
</script>

<section {id} class="example">
	<h3><a href={`#${id}`}>{title}</a></h3>
	<p class="description">{@render description()}</p>
	<div class="demo">
		{@render children()}
	</div>
</section>

<style>
	.example {
		margin: 0 0 3rem;
		scroll-margin-top: 1.5rem;
	}
	h3 {
		margin: 0 0 0.375rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.05rem;
	}
	h3 a {
		color: inherit;
		text-decoration: none;
	}
	h3 a:hover {
		text-decoration: underline;
	}
	.description {
		margin: 0 0 1rem;
		color: #555;
		line-height: 1.5;
	}
	.demo {
		padding: 1.25rem;
		border: 1px solid rgba(127, 127, 127, 0.25);
		border-radius: 0.5rem;
		background: white;
	}
	.demo > :global(:first-child),
	.demo > :global(:first-child > :first-child) {
		margin-top: 0;
	}
	.demo > :global(:last-child),
	.demo > :global(:last-child > :last-child) {
		margin-bottom: 0;
	}
</style>
