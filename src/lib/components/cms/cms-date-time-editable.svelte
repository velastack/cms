<script lang="ts">
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';
	import type { CmsDateTimeMode } from './cms-date-time.svelte';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		mode: CmsDateTimeMode;
		initial?: string;
	};

	let { scope, name, mode, initial }: Props = $props();

	const inputType = $derived(
		mode === 'date' ? 'date' : mode === 'time' ? 'time' : 'datetime-local'
	);

	const live = $derived(cmsStore.getValue(scope, name));
	const display = $derived(typeof live === 'string' ? live : (initial ?? ''));

	let el = $state<HTMLInputElement>();

	$effect(() => {
		if (!el) return;
		if (document.activeElement === el) return;
		if (el.value === display) return;
		el.value = display;
	});

	const onInput = (e: Event) => {
		const raw = (e.currentTarget as HTMLInputElement).value;
		if (raw === '') return;
		cmsStore.setValue(scope, name, raw);
	};
</script>

<input
	bind:this={el}
	class="cms-date-time-editable"
	type={inputType}
	data-cms-name={name}
	data-cms-scope={scope.scopeId}
	aria-label={name}
	oninput={onInput}
/>

<style>
	.cms-date-time-editable {
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
	}
	.cms-date-time-editable:focus {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 1px;
	}
</style>
