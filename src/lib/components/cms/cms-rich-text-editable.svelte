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
</script>

<textarea
	class="cms-rich-text-editable"
	value={current}
	placeholder={`${name} (HTML)`}
	oninput={(e) => cmsStore.setValue(scope, name, (e.target as HTMLTextAreaElement).value)}
></textarea>

<style>
	.cms-rich-text-editable {
		display: block;
		width: 100%;
		min-height: 6rem;
		padding: 0.5rem 0.625rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		background: rgba(127, 127, 127, 0.06);
		color: inherit;
		font: inherit;
		resize: vertical;
	}
	.cms-rich-text-editable:focus {
		outline: 2px solid rgb(99, 102, 241);
		outline-offset: 2px;
	}
</style>
