<script lang="ts" generics="T extends Record<string, unknown> = Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: T[];
		value?: unknown;
		children: Snippet<[T, number]>;
	};

	let { name, scope, fallback, value, children }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): T[] => {
			if (raw === undefined) return Array.isArray(fallback) ? fallback : [];
			return Array.isArray(raw) ? (raw as T[]) : [];
		}
	);

	const items = $derived(field.current);
</script>

{#if field.editable && field.ref}
	{#await import('./cms-repeater-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} {items} {children} />
	{/await}
{:else if items.length}
	{#each items as item, i}
		{@render children(item, i)}
	{/each}
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}>
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
