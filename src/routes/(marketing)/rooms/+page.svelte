<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();
</script>

<article>
	<h1>Rooms</h1>
	<ul class="rooms">
		{#each data.pages as page (page.params.slug)}
			<li><a href={resolve('/(marketing)/rooms/[slug]', page.params)}>{page.metadata.title}</a></li>
		{/each}
	</ul>
</article>

<style>
	article {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
	.rooms {
		list-style: none;
		padding: 0;
		margin: 1.5rem 0 0;
	}
	.rooms li + li {
		margin-top: 0.5rem;
	}
	.rooms a {
		display: block;
		padding: 0.75rem 1rem;
		border: 1px solid #e5e5e5;
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
	}
	.rooms a:hover {
		background: #f6f6f6;
	}
</style>
