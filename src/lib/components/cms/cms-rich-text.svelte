<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: string;
		value?: unknown;
		children?: Snippet;
	};

	let { name, scope, fallback, value, children }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): string | undefined => {
			if (raw === undefined) return fallback;
			return typeof raw === 'string' ? raw : '';
		}
	);

	const html = $derived(field.current ?? '');

	let childrenEl = $state<HTMLDivElement>();
	let initialFromChildren = $state<string | undefined>(undefined);

	$effect.pre(() => {
		if (field.editable && childrenEl && initialFromChildren === undefined) {
			const inner = childrenEl.innerHTML.trim();
			initialFromChildren = inner || undefined;
		}
	});

	const editInitial = $derived(field.current ?? initialFromChildren ?? '');
</script>

{#if field.editable && field.ref}
	<!-- Mounted straight into edit mode (navigation while editing): the
	     children branch below never rendered, so render it hidden once to
	     capture the default markup. Removed as soon as it's captured. -->
	{#if children && initialFromChildren === undefined}
		<div bind:this={childrenEl} class="cms-rich-text-capture">{@render children()}</div>
	{/if}
	{#await import('./cms-rich-text-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} initial={editInitial} />
	{/await}
{:else if html}
	<div class="cms-rich-text">{@html html}</div>
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else if children}
	<div bind:this={childrenEl} class="cms-rich-text-children">{@render children()}</div>
{:else}
	<div class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}>
		{name}
	</div>
{/if}

<style>
	.cms-rich-text {
		display: contents;
	}
	.cms-rich-text-children {
		display: contents;
	}
	.cms-rich-text-capture {
		display: none;
	}
	.cms-missing {
		padding: 0.25rem 0.5rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
