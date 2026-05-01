<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';
	import CssRoot from '../admin-bar/css-root.svelte';
	import Toolbar from './cms-rich-text-toolbar.svelte';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		initial: string;
	};
	let { scope, name, initial }: Props = $props();

	let host = $state<HTMLDivElement>();
	let wrap = $state<HTMLDivElement>();
	let editor = $state<Editor>();
	let focused = $state(false);
	let tick = $state(0);

	const current = $derived.by(() => {
		const draft = cmsStore.getValue(scope, name);
		return typeof draft === 'string' ? draft : initial;
	});

	onMount(() => {
		editor = new Editor({
			element: host,
			extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
			content: current,
			editorProps: {
				attributes: {
					class: 'cms-rich-text-editable-pm',
					'data-cms-name': name
				}
			},
			onUpdate: ({ editor }) => {
				cmsStore.setValue(scope, name, editor.getHTML());
			},
			onTransaction: () => {
				tick++;
			}
		});
	});

	onDestroy(() => editor?.destroy());

	$effect(() => {
		if (!editor || focused) return;
		const next = current;
		untrack(() => {
			if (!editor) return;
			if (editor.getHTML() !== next) {
				editor.commands.setContent(next, { emitUpdate: false });
			}
		});
	});
</script>

<CssRoot>
	<div
		class="cms-rich-text-editable-wrap"
		class:focused
		bind:this={wrap}
		onfocusin={() => (focused = true)}
		onfocusout={(e) => {
			const next = e.relatedTarget as Node | null;
			if (next && wrap?.contains(next)) return;
			focused = false;
		}}
	>
		{#if editor && focused}
			<Toolbar {editor} {tick} />
		{/if}
		<div bind:this={host}></div>
	</div>
</CssRoot>

<style>
	.cms-rich-text-editable-wrap {
		position: relative;
		border-radius: 0.25rem;
		outline: 1px dashed rgba(127, 127, 127, 0.6);
		outline-offset: 2px;
	}
	.cms-rich-text-editable-wrap.focused {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 2px;
	}
	.cms-rich-text-editable-wrap :global(.cms-rich-text-editable-pm) {
		outline: none;
		min-height: 1.5em;
	}
	.cms-rich-text-editable-wrap :global(.cms-rich-text-editable-pm p:first-child) {
		margin-top: 0;
	}
	.cms-rich-text-editable-wrap :global(.cms-rich-text-editable-pm p:last-child) {
		margin-bottom: 0;
	}
</style>
