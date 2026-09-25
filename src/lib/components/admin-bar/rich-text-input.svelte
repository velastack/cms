<script lang="ts">
	/**
	 * A rich text field inside a structured editor: the same TipTap setup as
	 * the inline `CmsRichText` editor, bound to a local value instead of a
	 * CMS path.
	 */
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Toolbar from '../cms/cms-rich-text-toolbar.svelte';

	type Props = {
		value: string;
		onChange: (html: string) => void;
		label?: string;
		placeholder?: string;
	};
	let { value, onChange, label }: Props = $props();

	let host = $state<HTMLDivElement>();
	let wrap = $state<HTMLDivElement>();
	let editor = $state<Editor>();
	let focused = $state(false);
	let tick = $state(0);

	onMount(() => {
		editor = new Editor({
			element: host,
			extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
			content: value,
			editorProps: { attributes: { class: 'cms-rich-text-input-pm' } },
			onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
			onTransaction: () => {
				tick++;
			}
		});
	});
	onDestroy(() => editor?.destroy());

	$effect(() => {
		if (!editor || focused) return;
		const next = value;
		untrack(() => {
			if (editor && editor.getHTML() !== next) {
				editor.commands.setContent(next, { emitUpdate: false });
			}
		});
	});
</script>

<div class="vela:flex vela:flex-col vela:gap-1.5">
	{#if label}<span class="vela:text-[12px] vela:text-bar-text-secondary">{label}</span>{/if}
	<div
		class="cms-rich-text-input vela:relative vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:px-3 vela:py-2 vela:text-[13px] vela:text-bar-text"
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
			<div class="vela:mb-2">
				<Toolbar {editor} {tick} />
			</div>
		{/if}
		<div bind:this={host}></div>
	</div>
</div>

<style>
	.cms-rich-text-input.focused {
		border-color: var(--cms-accent, #534ab7);
	}
	.cms-rich-text-input :global(.cms-rich-text-input-pm) {
		outline: none;
		min-height: 3em;
		line-height: 1.5;
	}
	.cms-rich-text-input :global(.cms-rich-text-input-pm > :first-child) {
		margin-top: 0;
	}
	.cms-rich-text-input :global(.cms-rich-text-input-pm > :last-child) {
		margin-bottom: 0;
	}
	.cms-rich-text-input :global(.cms-rich-text-input-pm ul),
	.cms-rich-text-input :global(.cms-rich-text-input-pm ol) {
		padding-left: 1.25em;
	}
</style>
