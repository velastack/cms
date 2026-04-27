<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, type CmsPayload } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		alt?: string;
		fallback?: string;
		value?: unknown;
		children?: Snippet;
	};

	let { name, alt = '', fallback, value, children }: Props = $props();

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
		const cms = page.data.cms as CmsPayload | undefined;
		return scope ? cms?.docs[scope.scopeId]?.[name] : undefined;
	});

	const src = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-image-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} {alt} initial={src} />
	{/await}
{:else if src}
	<img class="cms-image" {src} {alt} />
{:else if children}
	{@render children()}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>
		{name}
	</span>
{/if}

<style>
	.cms-image {
		max-width: 100%;
		height: auto;
	}
	.cms-missing {
		display: inline-block;
		padding: 0.5rem 0.75rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
