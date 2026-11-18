<script lang="ts">
	/**
	 * The bespoke editor for `CmsHours`: the week grid above the shape's other
	 * fields (note, exceptions, labels) rendered through the generic form. A
	 * field bound to the company profile keeps only its labels.
	 */
	import type { Snippet } from 'svelte';
	import type { Tree } from '../../core/path.js';
	import type { FormShape } from '../../core/shapes/form.js';
	import type { CmsHoursValue } from '../../core/shapes/hours.js';
	import type { CmsField } from './use-cms-field.svelte.js';
	import StructuredEditorPopover from '../admin-bar/structured-editor-popover.svelte';
	import FieldsForm from '../admin-bar/fields-form.svelte';
	import HoursWeek from '../admin-bar/hours-week.svelte';
	import CompanyOwned from '../admin-bar/company-owned.svelte';

	type Props = {
		field: CmsField<CmsHoursValue>;
		schema: FormShape<CmsHoursValue>;
		preview: Snippet;
		company?: boolean;
	};
	let { field, schema, preview, company = false }: Props = $props();
	let open = $state(false);
</script>

<StructuredEditorPopover {field} {schema} label={schema.label} {preview} bind:open>
	{#snippet editor(draft: CmsHoursValue, update: (next: CmsHoursValue) => void)}
		{#if company}
			<CompanyOwned onOpen={() => (open = false)} />
		{:else}
			<HoursWeek
				days={draft.days}
				closedLabel={draft.labels.closed}
				onChange={(days) => update({ ...draft, days })}
			/>
		{/if}
		<FieldsForm
			fields={schema.fields}
			value={draft as unknown as Tree}
			onChange={(next) => update(next as unknown as CmsHoursValue)}
		/>
	{/snippet}
</StructuredEditorPopover>
