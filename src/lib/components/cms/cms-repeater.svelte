<script lang="ts" generics="T = Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, getCmsValue, type CmsPayload } from './scope.js';

	type Props = {
		name: string;
		fallback?: T[];
		value?: unknown;
		children: Snippet<[T, number]>;
	};

	let { name, fallback, value, children }: Props = $props();

	const scope = getCmsScope();
	const resolved = $derived(
		value !== undefined ? value : getCmsValue(page.data.cms as CmsPayload | undefined, scope, name)
	);
	const items = $derived(
		Array.isArray(resolved) ? (resolved as T[]) : Array.isArray(fallback) ? fallback : []
	);
</script>

{#if items.length}
	{#each items as item, i}
		{@render children(item, i)}
	{/each}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>
		{name}
	</span>
{/if}

<style>
	.cms-missing {
		display: inline-block;
		padding: 0 0.25rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
