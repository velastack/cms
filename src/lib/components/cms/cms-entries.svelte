<script lang="ts" generics="R extends RouteId">
	import type { Snippet } from 'svelte';
	import type { RouteId, RouteParams } from '$app/types';
	import { cms } from './cms-store.svelte.js';
	import type { CmsEntry } from './scope.js';

	type Props = {
		routeId: R;
		children: Snippet<[CmsEntry<RouteParams<R>>, number]>;
		fallback?: Snippet;
	};

	let { routeId, children, fallback }: Props = $props();

	const items = $derived((cms.entries[routeId] ?? []) as CmsEntry<RouteParams<R>>[]);
</script>

{#if items.length}
	{#each items as item, i}
		{@render children(item, i)}
	{/each}
{:else if fallback}
	{@render fallback()}
{/if}
