<script lang="ts">
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		initial?: string;
	};

	let { scope, name, initial }: Props = $props();

	const live = $derived(cmsStore.getValue(scope, name));
	const display = $derived(typeof live === 'string' ? live : (initial ?? ''));

	let el = $state<HTMLTextAreaElement>();

	$effect(() => {
		if (!el) return;
		if (document.activeElement === el) return;
		if (el.value === display) return;
		el.value = display;
	});

	const autosize = (textarea: HTMLTextAreaElement) => {
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	};

	$effect(() => {
		if (!el) return;
		// re-run when display changes
		display;
		autosize(el);
	});

	const onInput = (e: Event) => {
		const target = e.currentTarget as HTMLTextAreaElement;
		cmsStore.setValue(scope, name, target.value);
		autosize(target);
	};
</script>

<textarea
	bind:this={el}
	class="cms-markdown-editable"
	data-cms-name={name}
	data-cms-scope={scope.scopeId}
	aria-label={name}
	rows="3"
	spellcheck="true"
	oninput={onInput}></textarea>

<style>
	.cms-markdown-editable {
		display: block;
		width: 100%;
		padding: 0.375rem 0.5rem;
		font: inherit;
		font-family: ui-monospace, monospace;
		font-size: 0.875em;
		line-height: 1.4;
		background: var(--cms-bar-bg, #1f1f1f);
		color: var(--cms-bar-text, #f5f5f5);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 0.25rem;
		resize: vertical;
		overflow: hidden;
		white-space: pre-wrap;
	}
	.cms-markdown-editable:focus {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 1px;
	}
</style>
