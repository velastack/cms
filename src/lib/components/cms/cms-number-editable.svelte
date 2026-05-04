<script lang="ts">
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		initial?: number;
		min?: number;
		max?: number;
		step?: number;
		integer?: boolean;
	};

	let { scope, name, initial, min, max, step, integer }: Props = $props();

	const live = $derived(cmsStore.getValue(scope, name));
	const display = $derived.by(() => {
		const v = typeof live === 'number' ? live : initial;
		return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
	});

	let el = $state<HTMLInputElement>();

	// Keep the DOM in sync with the resolved draft when the user isn't actively
	// typing into this instance. Mirrors `cms-text`'s effect-based sync —
	// without it, an external change (revert, locale switch, sibling write)
	// wouldn't be reflected in the input.
	$effect(() => {
		if (!el) return;
		if (document.activeElement === el) return;
		if (el.value === display) return;
		el.value = display;
	});

	const onInput = (e: Event) => {
		const raw = (e.currentTarget as HTMLInputElement).value;
		if (raw === '') return;
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		cmsStore.setValue(scope, name, integer ? Math.trunc(n) : n);
	};
</script>

<input
	bind:this={el}
	class="cms-number-editable"
	type="number"
	{min}
	{max}
	step={step ?? (integer ? 1 : undefined)}
	data-cms-name={name}
	data-cms-scope={scope.scopeId}
	aria-label={name}
	oninput={onInput}
/>

<style>
	.cms-number-editable {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		margin: 0 0.125rem;
		font: inherit;
		font-family: ui-monospace, monospace;
		font-size: 0.875em;
		line-height: 1;
		background: var(--cms-bar-bg, #1f1f1f);
		color: var(--cms-bar-text, #f5f5f5);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 0.25rem;
		vertical-align: middle;
		width: 6rem;
	}
	.cms-number-editable:focus {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 1px;
	}
</style>
