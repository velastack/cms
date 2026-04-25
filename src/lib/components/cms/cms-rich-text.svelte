<script lang="ts">
	import { page } from '$app/state';
	import { getCmsScope, getCmsValue, type CmsPayload } from './scope.js';

	type Props = {
		name: string;
		fallback?: string;
		value?: unknown;
	};

	let { name, fallback, value }: Props = $props();

	const scope = getCmsScope();
	const resolved = $derived(
		value !== undefined ? value : getCmsValue(page.data.cms as CmsPayload | undefined, scope, name)
	);
	const html = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
</script>

{#if html}
	<div class="cms-rich-text">{@html html}</div>
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
