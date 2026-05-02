<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getCmsScope } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		initial?: boolean;
		value?: unknown;
		children?: Snippet<[boolean]>;
	};
	let { name, initial = false, value, children }: Props = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope ? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params } : null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});

	const current = $derived(typeof resolved === 'boolean' ? resolved : initial);
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);

	const toggle = () => {
		if (ref) cmsStore.setValue(ref, name, !current);
	};
</script>

{#if editable && ref}
	<span class="cms-boolean-edit">
		{@render children?.(current)}
		<button
			type="button"
			role="switch"
			aria-checked={current}
			aria-label={`${name}: ${current ? 'on' : 'off'}`}
			class="cms-boolean-toggle"
			data-on={current}
			onclick={toggle}
		>
			<span class="cms-boolean-toggle__name">{name}</span>
			<span class="cms-boolean-toggle__pip"></span>
		</button>
	</span>
{:else}
	{@render children?.(current)}
{/if}

<style>
	.cms-boolean-edit {
		display: contents;
	}
	.cms-boolean-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0.5rem;
		margin: 0 0.25rem;
		background: var(--cms-bar-bg, #1f1f1f);
		color: var(--cms-bar-text, #f5f5f5);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 999px;
		cursor: pointer;
		font: inherit;
		font-size: 0.6875rem;
		font-family: ui-monospace, monospace;
		line-height: 1;
		vertical-align: middle;
	}
	.cms-boolean-toggle:hover {
		background: var(--cms-bar-bg-hover, #2e2e2e);
	}
	.cms-boolean-toggle__pip {
		display: inline-block;
		width: 18px;
		height: 10px;
		border-radius: 999px;
		background: rgba(127, 127, 127, 0.4);
		position: relative;
		transition: background-color 120ms;
	}
	.cms-boolean-toggle__pip::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: white;
		transition: transform 120ms;
	}
	.cms-boolean-toggle[data-on='true'] .cms-boolean-toggle__pip {
		background: var(--cms-accent, #534ab7);
	}
	.cms-boolean-toggle[data-on='true'] .cms-boolean-toggle__pip::after {
		transform: translateX(8px);
	}
</style>
