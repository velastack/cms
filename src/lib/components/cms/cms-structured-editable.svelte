<script lang="ts" generics="T extends Record<string, unknown>">
	/**
	 * The generic editable sibling of a structured component: the popover
	 * over the shape's declared fields. Loaded lazily, only in edit mode.
	 */
	import type { Snippet } from 'svelte';
	import type { FormShape } from '../../core/shapes/form.js';
	import type { Tree } from '../../core/path.js';
	import type { CmsField } from './use-cms-field.svelte.js';
	import StructuredEditorPopover from '../admin-bar/structured-editor-popover.svelte';
	import FieldsForm from '../admin-bar/fields-form.svelte';

	type Props = {
		field: CmsField<T>;
		schema: FormShape<T>;
		preview: Snippet;
	};
	let { field, schema, preview }: Props = $props();
</script>

<StructuredEditorPopover {field} {schema} label={schema.label} {preview}>
	{#snippet editor(draft: T, update: (next: T) => void)}
		<FieldsForm
			fields={schema.fields}
			value={draft as Tree}
			onChange={(next) => update(next as T)}
		/>
	{/snippet}
</StructuredEditorPopover>
