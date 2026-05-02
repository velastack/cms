<script lang="ts" module>
	export type CmsImageValue = {
		url?: string;
		alt?: string;
		width?: number;
		height?: number;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getCmsScope } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		/** Fallback alt text used when the branch has no `alt` leaf. */
		alt?: string;
		fallback?: string;
		value?: unknown;
		children?: Snippet;
	};

	let { name, alt = '', fallback, value, children }: Props = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope ? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params } : null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});

	// `<CmsImage>` owns a `{ url, alt, width?, height? }` branch. Accept a bare
	// string as the URL leaf for legacy/value-prop callers.
	const branch = $derived.by((): CmsImageValue | null => {
		if (resolved == null) return null;
		if (typeof resolved === 'string') return { url: resolved };
		if (typeof resolved === 'object' && !Array.isArray(resolved)) return resolved as CmsImageValue;
		return null;
	});

	const src = $derived(branch?.url ?? fallback ?? '');
	const altText = $derived(branch?.alt ?? alt ?? '');
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-image-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} initial={branch ?? {}} fallbackAlt={alt} />
	{/await}
{:else if src}
	<img class="cms-image" {src} alt={altText} />
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
