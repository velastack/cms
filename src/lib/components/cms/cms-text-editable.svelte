<script lang="ts">
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		initial: string;
	};

	let { scope, name, initial }: Props = $props();

	const current = $derived.by(() => {
		const draft = cmsStore.getValue(scope, name);
		return typeof draft === 'string' ? draft : initial;
	});

	const update = (value: string) => cmsStore.setValue(scope, name, value);
</script>

<input
	class="cms-text-editable"
	type="text"
	value={current}
	placeholder={name}
	oninput={(e) => update((e.target as HTMLInputElement).value)}
/>

<style>
	.cms-text-editable {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		background: rgba(127, 127, 127, 0.06);
		color: inherit;
		font: inherit;
		min-width: 8rem;
	}
	.cms-text-editable:focus {
		outline: 2px solid rgb(99, 102, 241);
		outline-offset: 2px;
	}
</style>
