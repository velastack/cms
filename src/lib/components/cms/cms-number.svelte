<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type CmsNumberProps = {
		name: string;
		scope?: string;
		fallback?: number;
		/** Per-item override used by structured components. */
		value?: unknown;
		min?: number;
		max?: number;
		step?: number;
		/** When true, decimals are truncated on commit and the input's step defaults to 1. */
		integer?: boolean;
		children?: Snippet<[number]>;
	};
</script>

<script lang="ts">
	import { useCmsField } from './use-cms-field.svelte.js';

	let { name, scope, fallback, value, min, max, step, integer, children }: CmsNumberProps =
		$props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): number | undefined => {
			if (raw === undefined) return fallback;
			return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
		}
	);

	const current = $derived(field.current);
</script>

{#if field.editable && field.ref}
	{#await import('./cms-number-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} initial={current} {min} {max} {step} {integer} />
	{/await}
{:else if current !== undefined && children}
	{@render children(current)}
{:else if current !== undefined}
	{current}
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else if children}
	{@render children(0)}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}
		>{name}</span
	>
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
