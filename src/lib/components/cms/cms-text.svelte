<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';

	type Props = {
		name: string;
		/** `'root'` for the root layout scope, or an explicit scope id. */
		scope?: string;
		fallback?: string;
		/** Per-item override used by structured components. */
		value?: unknown;
		children?: Snippet;
	};

	let { name, scope, fallback, value, children }: Props = $props();

	// `undefined` → fallback (or children); `null` → cleared, shown empty.
	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): string | undefined => {
			if (raw === undefined) return fallback;
			return typeof raw === 'string' ? raw : '';
		}
	);

	const display = $derived(field.current ?? '');

	let el = $state<HTMLSpanElement>();
	let childrenEl = $state<HTMLElement>();
	let initialFromChildren = $state<string | undefined>(undefined);
	let composing = false;

	$effect.pre(() => {
		if (field.editable && childrenEl && initialFromChildren === undefined) {
			const text = childrenEl.textContent?.trim();
			initialFromChildren = text || undefined;
		}
	});

	const editValue = $derived(field.current ?? initialFromChildren ?? '');

	$effect(() => {
		if (!el) return;
		const target = editValue;
		if (document.activeElement === el) return;
		if (el.textContent === target) return;
		el.textContent = target;
	});

	const onInput = (e: Event) => {
		if (composing) return;
		field.set((e.currentTarget as HTMLElement).textContent ?? '');
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') e.preventDefault();
	};

	const onCompositionEnd = (e: CompositionEvent) => {
		composing = false;
		field.set((e.currentTarget as HTMLElement).textContent ?? '');
	};
</script>

{#if field.editable && field.ref}
	<!-- Mounted straight into edit mode (navigation while editing): the
	     children branch below never rendered, so render it hidden once to
	     capture the default text. Removed as soon as it's captured. -->
	{#if children && initialFromChildren === undefined}
		<span bind:this={childrenEl} class="cms-text-capture">{@render children()}</span>
	{/if}
	<span
		bind:this={el}
		class="cms-text-editable"
		contenteditable="plaintext-only"
		data-placeholder={name}
		data-cms-name={name}
		data-cms-scope={field.ref.scopeId}
		role="textbox"
		tabindex="0"
		aria-multiline="false"
		aria-label={name}
		spellcheck="true"
		oninput={onInput}
		onkeydown={onKeydown}
		oncompositionstart={() => (composing = true)}
		oncompositionend={onCompositionEnd}
	></span>
{:else if display}
	{display}
{:else if field.raw === null}
	<!-- cleared by the editor: render nothing -->
{:else if children}
	<span bind:this={childrenEl} class="cms-text-children">{@render children()}</span>
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}
		>{name}</span
	>
{/if}

<style>
	.cms-text-editable {
		border-radius: 0.125rem;
		outline: 1px dashed rgba(127, 127, 127, 0.6);
		outline-offset: 2px;
	}
	.cms-text-editable:focus {
		outline: 2px solid rgb(99, 102, 241);
		outline-offset: 2px;
	}
	.cms-text-editable:empty::before {
		content: attr(data-placeholder);
		color: rgba(127, 127, 127, 0.6);
		font-style: italic;
	}

	.cms-text-children {
		display: contents;
	}
	.cms-text-capture {
		display: none;
	}

	.cms-missing {
		display: inline-block;
		padding: 0 0.25rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
