<script lang="ts">
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		alt: string;
		initial: string;
	};

	let { scope, name, alt, initial }: Props = $props();

	const current = $derived.by(() => {
		const draft = cmsStore.getValue(scope, name);
		return typeof draft === 'string' ? draft : initial;
	});
</script>

<div class="cms-image-editable">
	{#if current}
		<img class="cms-image-editable__preview" src={current} {alt} />
	{:else}
		<div class="cms-image-editable__empty">{name}</div>
	{/if}
	<input
		type="url"
		class="cms-image-editable__input"
		value={current}
		placeholder={`${name} (URL)`}
		oninput={(e) => cmsStore.setValue(scope, name, (e.target as HTMLInputElement).value)}
	/>
</div>

<style>
	.cms-image-editable {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.375rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		background: rgba(127, 127, 127, 0.06);
	}
	.cms-image-editable__preview {
		max-width: 100%;
		height: auto;
		border-radius: 0.25rem;
	}
	.cms-image-editable__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 4rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
	.cms-image-editable__input {
		padding: 0.25rem 0.5rem;
		border: 1px solid rgba(127, 127, 127, 0.4);
		border-radius: 0.25rem;
		background: canvas;
		color: inherit;
		font: inherit;
	}
	.cms-image-editable__input:focus {
		outline: 2px solid rgb(99, 102, 241);
		outline-offset: 2px;
	}
</style>
