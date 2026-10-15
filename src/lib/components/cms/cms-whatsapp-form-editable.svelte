<script lang="ts">
	/**
	 * The editor for `CmsWhatsAppForm`: the shape's fields, plus the
	 * `{placeholders}` the form's inputs provide, read from the form when the
	 * popover opens so fields added through `CmsFormFields` show up too.
	 */
	import type { Snippet } from 'svelte';
	import type { Tree } from '../../core/path.js';
	import type { FormShape } from '../../core/shapes/form.js';
	import type { CmsWhatsAppValue } from '../../core/shapes/whatsapp.js';
	import type { CmsField } from './use-cms-field.svelte.js';
	import { getWhatsAppFieldNames } from './cms-whatsapp-form.svelte';
	import StructuredEditorPopover from '../admin-bar/structured-editor-popover.svelte';
	import FieldsForm from '../admin-bar/fields-form.svelte';

	type Props = {
		field: CmsField<CmsWhatsAppValue>;
		schema: FormShape<CmsWhatsAppValue>;
		preview: Snippet;
	};
	let { field, schema, preview }: Props = $props();

	const fieldNames = getWhatsAppFieldNames();
</script>

<StructuredEditorPopover {field} {schema} label={schema.label} {preview}>
	{#snippet editor(draft: CmsWhatsAppValue, update: (next: CmsWhatsAppValue) => void)}
		{@const names = fieldNames()}
		<FieldsForm
			fields={schema.fields}
			value={draft as Tree}
			onChange={(next) => update(next as CmsWhatsAppValue)}
		/>
		{#if names.length > 0}
			<p class="vela:text-[11px] vela:text-bar-text-tertiary vela:m-0">
				Placeholders:
				{#each names as name (name)}
					<code class="vela:font-mono vela:mr-1">{`{${name}}`}</code>
				{/each}
			</p>
		{/if}
	{/snippet}
</StructuredEditorPopover>
