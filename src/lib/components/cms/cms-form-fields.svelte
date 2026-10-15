<script lang="ts" module>
	/** `CmsFormFields`: a form's inputs as content editors can change. */
	export * from '../../core/shapes/form-fields.js';
</script>

<script lang="ts">
	/**
	 * Goes inside a `CmsForm` or `CmsWhatsAppForm`. Renders one input per
	 * field through the template's `field` snippet, or plain labelled inputs
	 * without one. Editors add, remove, reorder and retype fields from the
	 * pencil; each field's submitted `name` stays put (see the shape).
	 */
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import {
		cmsFormFields,
		formFieldsView,
		type CmsFormFieldItem,
		type CmsFormFieldsValue
	} from '../../core/shapes/form-fields.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare field list. */
		fallback?: Partial<CmsFormFieldsValue> | Array<Partial<CmsFormFieldItem>>;
		value?: unknown;
		field?: Snippet<[CmsFormFieldItem]>;
	};
	let { name, scope, fallback, value, field }: Props = $props();
</script>

{#snippet plain(f: CmsFormFieldItem)}
	<label class="cms-form-field" data-type={f.type}>
		{#if f.type === 'checkbox'}
			<input type="checkbox" name={f.name} value="yes" required={f.required} />
			<span>{f.label}</span>
		{:else}
			<span>{f.label}</span>
			{#if f.type === 'textarea'}
				<textarea name={f.name} required={f.required} placeholder={f.placeholder || undefined}
				></textarea>
			{:else if f.type === 'select'}
				<select name={f.name} required={f.required}>
					<option value="">{f.placeholder}</option>
					{#each f.options as option, i (i)}
						<option>{option}</option>
					{/each}
				</select>
			{:else}
				<input
					type={f.type}
					name={f.name}
					required={f.required}
					placeholder={f.placeholder || undefined}
				/>
			{/if}
		{/if}
	</label>
{/snippet}

<Structured schema={cmsFormFields} {name} {scope} {fallback} {value} view={formFieldsView}>
	{#snippet children(fields)}
		{#each fields as f (f.id)}
			{@render (field ?? plain)(f)}
		{/each}
	{/snippet}
</Structured>
