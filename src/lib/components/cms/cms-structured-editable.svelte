<script lang="ts" generics="T extends Record<string, unknown>">
	/**
	 * The generic editable sibling of a structured component: the popover
	 * over the shape's declared fields. Loaded lazily, only in edit mode.
	 * `company` marks a field bound to the company profile: the schema it
	 * gets holds only the fields it still owns.
	 */
	import type { Snippet } from 'svelte';
	import type { FormShape } from '../../core/shapes/form.js';
	import type { Tree } from '../../core/path.js';
	import type { CmsField } from './use-cms-field.svelte.js';
	import StructuredEditorPopover from '../admin-bar/structured-editor-popover.svelte';
	import FieldsForm from '../admin-bar/fields-form.svelte';
	import CompanyOwned from '../admin-bar/company-owned.svelte';

	type Props = {
		field: CmsField<T>;
		schema: FormShape<T>;
		preview: Snippet;
		company?: boolean;
	};
	let { field, schema, preview, company = false }: Props = $props();
	let open = $state(false);
</script>

<StructuredEditorPopover {field} {schema} label={schema.label} {preview} bind:open>
	{#snippet editor(draft: T, update: (next: T) => void)}
		{#if company}<CompanyOwned onOpen={() => (open = false)} />{/if}
		<FieldsForm
			fields={schema.fields}
			value={draft as Tree}
			onChange={(next) => update(next as T)}
		/>
	{/snippet}
</StructuredEditorPopover>
