<script lang="ts">
	import { page } from '$app/state';
	import { getCmsScope, getCmsValue, type CmsPayload } from './scope.js';

	type Props = {
		name: string;
		alt?: string;
		fallback?: string;
		value?: unknown;
	};

	let { name, alt = '', fallback, value }: Props = $props();

	const scope = getCmsScope();
	const resolved = $derived(
		value !== undefined ? value : getCmsValue(page.data.cms as CmsPayload | undefined, scope, name)
	);
	const src = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
</script>

{#if src}
	<img class="cms-image" {src} {alt} />
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
