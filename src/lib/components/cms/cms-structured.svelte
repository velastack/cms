<script lang="ts" generics="T extends Record<string, unknown>, V">
	/**
	 * The one display component behind every structured editor component.
	 * It reads the value through the shape, derives the template's view of
	 * it and renders `children(view)`; in edit mode it swaps in the lazily
	 * loaded editable sibling (the generic form, or a bespoke one).
	 */
	import type { Component, Snippet } from 'svelte';
	import type { FormShape } from '../../core/shapes/form.js';
	import { useCmsField, type CmsField } from './use-cms-field.svelte.js';

	type EditableProps = { field: CmsField<T>; schema: FormShape<T>; preview: Snippet };
	type Props = {
		schema: FormShape<T>;
		name: string;
		scope?: string;
		fallback?: unknown;
		value?: unknown;
		view: (value: T) => V;
		children: Snippet<[V]>;
		/** Loader for a bespoke editable sibling; defaults to the generic form. */
		editable?: () => Promise<{ default: Component<EditableProps> }>;
	};
	let { schema, name, scope, fallback, value, view, children, editable }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw) => schema.read(raw, fallback as T | undefined)
	);
	const current = $derived(view(field.current));
	const load = $derived(
		editable ??
			(() =>
				import('./cms-structured-editable.svelte') as unknown as Promise<{
					default: Component<EditableProps>;
				}>)
	);
</script>

{#snippet preview()}
	{@render children(current)}
{/snippet}

{#if field.editable}
	{#await load() then { default: Editable }}
		<Editable {field} {schema} {preview} />
	{/await}
{:else}
	{@render children(current)}
{/if}
