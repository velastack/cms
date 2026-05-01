<script lang="ts">
	import { resolve } from '$app/paths';
	import { CmsEntries, CmsText } from '$lib/index.js';
</script>

<article>
	<h1>
		<CmsText name="rooms.title" fallback="Rooms"></CmsText>
	</h1>
	<CmsText name="rooms.description">We have so many rooms.</CmsText>
	<ul class="rooms">
		<CmsEntries routeId="/(marketing)/rooms/[slug]">
			{#snippet children(entry)}
				<li>
					<a href={resolve('/(marketing)/rooms/[slug]', entry.params)}>
						{entry.metadata.title}
					</a>
				</li>
			{/snippet}
		</CmsEntries>
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
