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

	// `name="metadata.<key>"` reads/writes page-scoped metadata via the metadata
	// API, ignoring the local (possibly layout) scope. Resolved through `cms.page`
	// so the same component can sit in a layout and still target the page leaf.
	const isMeta = $derived(name.startsWith('metadata.'));
	const metaKey = $derived(isMeta ? name.slice('metadata.'.length) : '');

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const ref = $derived.by<CmsScopeRef | null>(() => {
		if (isMeta) {
			return cms?.page
				? { scopeId: cms.page.scopeId, routeId: cms.page.routeId, params: cms.page.params }
				: null;
		}
		return scope
			? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params }
			: null;
	});

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		if (isMeta) {
			if (cmsStore.isEditing && ref && cmsStore.hasMetadataDraft(ref, metaKey)) {
				return cmsStore.getMetadataValue(ref, metaKey);
			}
			if (ref && cmsStore.hasMetadataOverlay(ref, metaKey)) {
				return cmsStore.getMetadataOverlayValue(ref, metaKey);
			}
			return cms?.metadata[metaKey];
		}
		if (cmsStore.isEditing && ref && cmsStore.hasDraft(ref, name)) {
			return cmsStore.getValue(ref, name);
		}
		if (ref && cmsStore.hasOverlay(ref, name)) {
			return cmsStore.getOverlayValue(ref, name);
		}
		return scope ? cms?.docs[scope.scopeId]?.[name] : undefined;
	});

	const display = $derived(typeof resolved === 'string' ? resolved : (fallback ?? ''));
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);

	let el = $state<HTMLSpanElement>();
	let childrenEl = $state<HTMLElement>();
	let initialFromChildren = $state<string | undefined>(undefined);
	let composing = false;

	// Capture the children-rendered text the instant edit mode turns on. The
	// children block unmounts as soon as `editable` flips, so we read the DOM
	// in `$effect.pre` (after state, before bindings update).
	$effect.pre(() => {
		if (editable && childrenEl && initialFromChildren === undefined) {
			const text = childrenEl.textContent?.trim();
			initialFromChildren = text || undefined;
		}
	});

	// Default text for the editable span: resolved value (incl. empty drafts)
	// wins, then the explicit `fallback` prop, then the captured children text.
	// An empty draft must stay empty — we don't want a revert to refill it.
	const editValue = $derived.by(() => {
		if (typeof resolved === 'string') return resolved;
		if (fallback !== undefined) return fallback;
		return initialFromChildren ?? '';
	});

	// Drive textContent imperatively. Svelte 5 caches the last value it wrote
	// to a text expression, so `<span>{display}</span>` re-applies on every
	// store update and resets the caret to start. Skip while focused so live
	// typing is left alone; external reverts (cancel/discard) land on blur.
	$effect(() => {
		if (!el) return;
		const target = editValue;
		if (document.activeElement === el) return;
		if (el.textContent === target) return;
		el.textContent = target;
	});

	const writeValue = (text: string) => {
		if (!ref) return;
		if (isMeta) cmsStore.setMetadataValue(ref, metaKey, text);
		else cmsStore.setValue(ref, name, text);
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
