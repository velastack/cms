<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getCmsScope } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		name: string;
		fallback?: string;
		/** Per-item override used by `CmsRepeater`. */
		value?: unknown;
		children?: Snippet;
	};

	let { name, fallback, value, children }: Props = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope ? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params } : null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});

	const display = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);

	let el = $state<HTMLSpanElement>();
	let childrenEl = $state<HTMLElement>();
	let initialFromChildren = $state<string | undefined>(undefined);
	let composing = false;

	$effect.pre(() => {
		if (editable && childrenEl && initialFromChildren === undefined) {
			const text = childrenEl.textContent?.trim();
			initialFromChildren = text || undefined;
		}
	});

	const editValue = $derived.by(() => {
		if (typeof resolved === 'string') return resolved;
		if (fallback !== undefined) return fallback;
		return initialFromChildren ?? '';
	});

	$effect(() => {
		if (!el) return;
		const target = editValue;
		if (document.activeElement === el) return;
		if (el.textContent === target) return;
		el.textContent = target;
	});

	const writeValue = (text: string) => {
		if (!ref) return;
		cmsStore.setValue(ref, name, text);
	};

	const onInput = (e: Event) => {
		if (composing) return;
		writeValue((e.currentTarget as HTMLElement).textContent ?? '');
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') e.preventDefault();
	};

	const onCompositionEnd = (e: CompositionEvent) => {
		composing = false;
		writeValue((e.currentTarget as HTMLElement).textContent ?? '');
	};
</script>

{#if editable && ref}
	<span
		bind:this={el}
		class="cms-text-editable"
		contenteditable="plaintext-only"
		data-placeholder={name}
		data-cms-name={name}
		data-cms-scope={scope?.scopeId ?? '?'}
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
{:else if children}
	<span bind:this={childrenEl} class="cms-text-children">{@render children()}</span>
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>{name}</span>
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
