<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type CmsNumberProps = {
		name: string;
		fallback?: number;
		/** Per-item override used by `CmsRepeater`. */
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
	import { getCmsScope } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	let { name, fallback, value, min, max, step, integer, children }: CmsNumberProps = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope ? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params } : null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});

	const current = $derived(typeof resolved === 'number' ? resolved : fallback);
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-number-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} initial={current} {min} {max} {step} {integer} />
	{/await}
{:else if current !== undefined && children}
	{@render children(current)}
{:else if current !== undefined}
	{current}
{:else if children}
	{@render children(0)}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>{name}</span>
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
