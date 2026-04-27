<script lang="ts" generics="T extends Record<string, unknown> = Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, type CmsPayload } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		fallback?: T[];
		value?: unknown;
		children: Snippet<[T, number]>;
	};

	let { name, fallback, value, children }: Props = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope
			? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params }
			: null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		if (cmsStore.isEditing && ref && cmsStore.hasDraft(ref, name)) {
			return cmsStore.getValue(ref, name);
		}
		if (ref && cmsStore.hasOverlay(ref, name)) {
			return cmsStore.getOverlayValue(ref, name);
		}
		const cms = page.data.cms as CmsPayload | undefined;
		return scope ? cms?.docs[scope.scopeId]?.[name] : undefined;
	});

	const items = $derived(
		Array.isArray(resolved) ? (resolved as T[]) : Array.isArray(fallback) ? fallback : []
	);
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-repeater-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} {items} {children} />
	{/await}
{:else if items.length}
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
