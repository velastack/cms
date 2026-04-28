<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, type CmsPayload } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		fallback?: string;
		value?: unknown;
		children?: Snippet;
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

	const html = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-rich-text-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} initial={html} />
	{/await}
{:else if html}
	<div class="cms-rich-text">{@html html}</div>
{:else if children}
	{@render children()}
{:else}
	<div class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>
		{name}
	</div>
{/if}

<style>
	.cms-rich-text {
		display: contents;
	}
	.cms-missing {
		padding: 0.25rem 0.5rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
