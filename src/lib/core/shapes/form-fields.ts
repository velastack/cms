/**
 * `CmsFormFields`: the inputs of a form, as content an editor can add to,
 * remove from, reorder and retype.
 *
 * A field's `name` is the key its answer is stored under, so it must not
 * follow later label edits or a form's submissions would split across keys.
 * Fields from the template's fallback carry their own names. A field an
 * editor adds has none until its label is first saved; reads derive one from
 * the label, and the next save through the popover writes it down, after
 * which renaming the label leaves it alone. The editor never shows `name`.
 */
import { asBoolean, asEnum, asItems, asString, asStrings, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';

export const FORM_FIELD_TYPES = [
	'text',
	'email',
	'tel',
	'number',
	'date',
	'textarea',
	'select',
	'checkbox'
] as const;

export type CmsFormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type CmsFormFieldItem = {
	id: string;
	/** The submitted field name. */
	name: string;
	label: string;
	type: CmsFormFieldType;
	required: boolean;
	placeholder: string;
	/** `select`: the choices, in order. */
	options: string[];
};

export type CmsFormFieldsValue = ListValue<CmsFormFieldItem>;

/** `Preferred date` → `preferred_date`; a label with no latin letters → `field`. */
export const fieldNameFromLabel = (label: string): string =>
	label
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'field';

/**
 * Give every field a distinct name. Stored names are kept and claimed
 * first, so a newly added field can never take one an existing field's
 * submissions already use; derived names get `_2`, `_3`, … on a clash.
 */
const assignNames = (items: Array<CmsFormFieldItem & { stored: string }>): CmsFormFieldItem[] => {
	const taken = new Set<string>();
	const named = items.map((item) => {
		if (!item.stored || taken.has(item.stored)) return { ...item, name: '' };
		taken.add(item.stored);
		return { ...item, name: item.stored };
	});
	return named.map(({ stored: _stored, ...item }) => {
		if (item.name) return item;
		const base = fieldNameFromLabel(item.label);
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return { ...item, name };
	});
};

export const cmsFormFields = defineForm<CmsFormFieldsValue>({
	component: 'CmsFormFields',
	label: 'Form fields',
	version: 1,
	translatable: [],
	items: { key: 'items', translatable: ['label', 'placeholder', 'options'] },
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: assignNames(
				asItems<CmsFormFieldItem & { stored: string }>(items, (r) => ({
					stored: asString(r.name).trim(),
					name: '',
					label: asString(r.label),
					type: asEnum(r.type, FORM_FIELD_TYPES, 'text'),
					required: asBoolean(r.required),
					placeholder: asString(r.placeholder),
					options: asStrings(r.options)
				}))
			)
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Fields',
			type: 'list',
			itemLabel: 'field',
			titleKey: 'label',
			blank: () => ({ label: '', type: 'text', required: false, placeholder: '', options: [] }),
			fields: [
				{ key: 'label', label: 'Label', type: 'text' },
				{
					key: 'type',
					label: 'Type',
					type: 'enum',
					values: FORM_FIELD_TYPES,
					names: {
						text: 'Short text',
						email: 'Email',
						tel: 'Phone',
						number: 'Number',
						date: 'Date',
						textarea: 'Long text',
						select: 'Dropdown',
						checkbox: 'Checkbox'
					},
					half: true
				},
				{ key: 'required', label: 'Required', type: 'boolean' },
				{ key: 'placeholder', label: 'Placeholder', type: 'text' },
				{
					key: 'options',
					label: 'Dropdown choices',
					type: 'strings',
					placeholder: 'One per line'
				}
			]
		}
	]
});

/** What a template renders: every field, in order. */
export const formFieldsView = (value: CmsFormFieldsValue): CmsFormFieldItem[] => value.items;
