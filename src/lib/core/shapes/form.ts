/**
 * What the generic structured editor renders for a shape. A component's
 * schema lists its fields; the popover walks them and draws one input per
 * field. `list` fields hold items (stable `id` each) with their own fields,
 * so a collection item's details or a pricing tier's features are edited in
 * place. Templates never see this: they get the typed value.
 */
import type { Tree } from '../path.js';
import { defineStructured, type Structured, type StructuredSchema } from '../structured.js';
import { registerStructured } from '../structured-registry.js';

export type FormFieldType =
	| 'text'
	| 'long-string'
	| 'html'
	| 'number'
	| 'boolean'
	| 'date'
	| 'time'
	| 'url'
	| 'image'
	| 'images'
	| 'enum'
	| 'link'
	| 'strings'
	| 'rating'
	| 'list';

export type FormField = {
	/** Dotted path within the object being edited (`name`, `price.amount`). */
	key: string;
	label: string;
	type: FormFieldType;
	placeholder?: string;
	/** `enum`: the stored values, and optional display names. */
	values?: readonly string[];
	names?: Readonly<Record<string, string>>;
	/** Share a row with the next field. */
	half?: boolean;
	/** Tab the field sits in. Fields without a group share the first tab. */
	group?: string;
	/** `list`: what one item is called ("tier"), its fields, a blank item
	 * (without `id`) and which field titles a collapsed card. */
	itemLabel?: string;
	fields?: readonly FormField[];
	blank?: () => Tree;
	titleKey?: string;
};

export type FormShape<T extends Tree> = Structured<T> & {
	/** Popover header, e.g. "Opening hours". */
	label: string;
	fields: readonly FormField[];
};

export const defineForm = <T extends Tree>(
	schema: StructuredSchema<T> & { label: string; fields: readonly FormField[] }
): FormShape<T> => {
	const { label, fields, ...rest } = schema;
	const structured = registerStructured(defineStructured<T>(rest));
	return { ...structured, label, fields };
};

/** Shared vocabulary for the list-shaped components: `{ v: 1, items }`. */
export type ListValue<I extends { id: string }> = { v: 1; items: I[] };
