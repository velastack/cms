<script lang="ts">
	import type { Snippet } from 'svelte';
	import { marked } from 'marked';
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

	const source = $derived(field.current ?? '');
</script>

{#if field.editable && field.ref}
	{#await import('./cms-markdown-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} initial={source} />
	{/await}
{:else if source}
	<div class="cms-markdown">{@html marked.parse(source, { async: false })}</div>
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else if children}
	{@render children()}
{:else}
	<div class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}>
		{name}
	</div>
{/if}

<style>
	.cms-markdown {
		display: contents;
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
