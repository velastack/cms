<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, type CmsPayload } from './scope.js';
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
		scope
			? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params }
			: null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		if (cmsStore.isEditing && ref && cmsStore.hasDraft(ref, name)) {
			return cmsStore.getValue(ref, name);
		}
		if (ref && cmsStore.hasOverlay(ref, name)) {
			return cmsStore.getOverlayValue(ref, name);
		}
		const cms = page.data.cms as CmsPayload | undefined;
		return scope ? cms?.docs[scope.scopeId]?.[name] : undefined;
	});

	const display = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);

	let el = $state<HTMLSpanElement>();
	let composing = false;

	// Drive textContent imperatively. Svelte 5 caches the last value it wrote
	// to a text expression, so `<span>{display}</span>` re-applies on every
	// store update and resets the caret to start. Skip while focused so live
	// typing is left alone; external reverts (cancel/discard) land on blur.
	$effect(() => {
		if (!el) return;
		const target = display;
		if (document.activeElement === el) return;
		if (el.textContent === target) return;
		el.textContent = target;
	});

	const onInput = (e: Event) => {
		if (composing || !ref) return;
		cmsStore.setValue(ref, name, (e.currentTarget as HTMLElement).textContent ?? '');
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') e.preventDefault();
	};

	const onCompositionEnd = (e: CompositionEvent) => {
		composing = false;
		if (!ref) return;
		cmsStore.setValue(ref, name, (e.currentTarget as HTMLElement).textContent ?? '');
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
	{@render children()}
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
