<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { tick as svelteTick } from 'svelte';
	import { Button } from '$lib/components/admin-bar/ui/button/index.js';
	import { Input } from '$lib/components/admin-bar/ui/input/index.js';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import LinkIcon from '@lucide/svelte/icons/link';
	import UnlinkIcon from '@lucide/svelte/icons/link-2-off';
	import H2Icon from '@lucide/svelte/icons/heading-2';
	import H3Icon from '@lucide/svelte/icons/heading-3';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import CodeIcon from '@lucide/svelte/icons/code';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';

	type Props = {
		editor: Editor;
		/** Bumped on every editor transaction so derived state re-runs. */
		tick: number;
	};
	let { editor, tick }: Props = $props();

	const active = $derived.by(() => {
		void tick;
		return {
			bold: editor.isActive('bold'),
			italic: editor.isActive('italic'),
			h2: editor.isActive('heading', { level: 2 }),
			h3: editor.isActive('heading', { level: 3 }),
			bullet: editor.isActive('bulletList'),
			ordered: editor.isActive('orderedList'),
			quote: editor.isActive('blockquote'),
			code: editor.isActive('code'),
			link: editor.isActive('link')
		};
	});

	let mode: 'normal' | 'link' = $state('normal');
	let linkUrl = $state('');
	let linkInputEl: HTMLInputElement | null = $state(null);

	const stop = (e: Event) => e.preventDefault();

	const run = (fn: () => void) => (e: MouseEvent) => {
		e.preventDefault();
		fn();
	};

	const openLink = async (e: MouseEvent) => {
		e.preventDefault();
		linkUrl = (editor.getAttributes('link').href as string | undefined) ?? '';
		mode = 'link';
		await svelteTick();
		linkInputEl?.focus();
		linkInputEl?.select();
	};

	const applyLink = () => {
		const href = linkUrl.trim();
		if (href) {
			editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
		} else {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
		}
		mode = 'normal';
	};

	const removeLink = (e: MouseEvent) => {
		e.preventDefault();
		editor.chain().focus().extendMarkRange('link').unsetLink().run();
		mode = 'normal';
	};

	const cancelLink = () => {
		mode = 'normal';
		editor.chain().focus().run();
	};

	const onLinkKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyLink();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelLink();
		}
	};
</script>

<div class="cms-rt-toolbar" role="toolbar" tabindex="-1" aria-label="Formatting" onmousedown={stop}>
	{#if mode === 'normal'}
		<Button
			size="icon"
			variant="ghost"
			aria-label="Bold"
			data-active={active.bold}
			onmousedown={run(() => editor.chain().focus().toggleBold().run())}
		>
			<BoldIcon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Italic"
			data-active={active.italic}
			onmousedown={run(() => editor.chain().focus().toggleItalic().run())}
		>
			<ItalicIcon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Inline code"
			data-active={active.code}
			onmousedown={run(() => editor.chain().focus().toggleCode().run())}
		>
			<CodeIcon class="vela:size-4" />
		</Button>

		<span class="cms-rt-divider" aria-hidden="true"></span>

		<Button
			size="icon"
			variant="ghost"
			aria-label="Heading 2"
			data-active={active.h2}
			onmousedown={run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
		>
			<H2Icon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Heading 3"
			data-active={active.h3}
			onmousedown={run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
		>
			<H3Icon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Bullet list"
			data-active={active.bullet}
			onmousedown={run(() => editor.chain().focus().toggleBulletList().run())}
		>
			<ListIcon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Ordered list"
			data-active={active.ordered}
			onmousedown={run(() => editor.chain().focus().toggleOrderedList().run())}
		>
			<ListOrderedIcon class="vela:size-4" />
		</Button>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Blockquote"
			data-active={active.quote}
			onmousedown={run(() => editor.chain().focus().toggleBlockquote().run())}
		>
			<QuoteIcon class="vela:size-4" />
		</Button>

		<span class="cms-rt-divider" aria-hidden="true"></span>

		<Button
			size="icon"
			variant="ghost"
			aria-label="Link"
			data-active={active.link}
			onmousedown={openLink}
		>
			<LinkIcon class="vela:size-4" />
		</Button>

		<span class="cms-rt-divider" aria-hidden="true"></span>

		<Button
			size="icon"
			variant="ghost"
			aria-label="Undo"
			onmousedown={run(() => editor.chain().focus().undo().run())}
		>
			<UndoIcon class="vela:size-4" />
		</Button>
	{:else}
		<Input
			bind:ref={linkInputEl}
			bind:value={linkUrl}
			type="url"
			placeholder="https://example.com"
			onkeydown={onLinkKey}
			class="vela:h-7 vela:w-64 vela:text-xs"
		/>
		<Button size="icon" variant="ghost" aria-label="Apply link" onmousedown={run(applyLink)}>
			<CheckIcon class="vela:size-4" />
		</Button>
		{#if active.link}
			<Button size="icon" variant="ghost" aria-label="Remove link" onmousedown={removeLink}>
				<UnlinkIcon class="vela:size-4" />
			</Button>
		{/if}
		<Button size="icon" variant="ghost" aria-label="Cancel" onmousedown={run(cancelLink)}>
			<XIcon class="vela:size-4" />
		</Button>
	{/if}
</div>

<style>
	.cms-rt-toolbar {
		position: absolute;
		left: 0;
		top: 0;
		transform: translateY(calc(-100% - 0.5rem));
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0.25rem;
		background: var(--cms-bar-bg, #1f1f1f);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 0.375rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		color: var(--cms-bar-text, #f5f5f5);
		z-index: 50;
		white-space: nowrap;
	}
	.cms-rt-divider {
		display: inline-block;
		width: 1px;
		align-self: stretch;
		margin: 0.125rem 0.25rem;
		background: var(--cms-bar-divider, #3a3a3a);
	}
	.cms-rt-toolbar :global([data-active='true']) {
		background: var(--cms-bar-bg-hover, #2e2e2e);
		color: var(--cms-bar-text, #f5f5f5);
	}
</style>
