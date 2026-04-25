<script lang="ts">
	import { page } from '$app/state';
	import { getCmsScope, getCmsValue, type CmsPayload } from './scope.js';

	type Props = {
		name: string;
		fallback?: string;
		/**
		 * Override value, used by `CmsRepeater` to pass per-item values into a
		 * nested `CmsText`.
		 */
		value?: unknown;
	};

	let { name, fallback, value }: Props = $props();

	const scope = getCmsScope();
	const resolved = $derived(
		value !== undefined ? value : getCmsValue(page.data.cms as CmsPayload | undefined, scope, name)
	);
	const display = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
</script>

{#if display}
	{display}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>{name}</span
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
