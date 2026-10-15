import { describe, expect, it } from 'vitest';
import { translatableFields } from '../structured.js';
import { cmsFormFields, fieldNameFromLabel, formFieldsView } from './form-fields.js';
import { cmsWhatsApp } from './whatsapp.js';

describe('fieldNameFromLabel', () => {
	it('should turn a label into a field name', () => {
		expect(fieldNameFromLabel('Preferred date')).toBe('preferred_date');
		expect(fieldNameFromLabel('  Número de teléfono? ')).toBe('numero_de_telefono');
		expect(fieldNameFromLabel('_hidden_')).toBe('hidden');
	});

	it('should fall back when nothing usable is left', () => {
		expect(fieldNameFromLabel('')).toBe('field');
		expect(fieldNameFromLabel('お名前')).toBe('field');
	});
});

describe('cmsFormFields', () => {
	it('should take a bare list as the fallback', () => {
		const value = cmsFormFields.read(undefined, [
			{ name: 'email', label: 'Email', type: 'email', required: true }
		] as never);
		expect(formFieldsView(value)).toEqual([
			{
				id: 'item-0',
				name: 'email',
				label: 'Email',
				type: 'email',
				required: true,
				placeholder: '',
				options: []
			}
		]);
	});

	it('should default an unknown type to text', () => {
		const value = cmsFormFields.normalize([{ name: 'x', label: 'X', type: 'color' }]);
		expect(value.items[0].type).toBe('text');
	});

	it('should derive a name for a field added without one', () => {
		const value = cmsFormFields.normalize([{ id: 'a1', label: 'Preferred date', type: 'date' }]);
		expect(value.items[0].name).toBe('preferred_date');
	});

	it('should keep a stored name when the label changes', () => {
		const value = cmsFormFields.normalize([{ id: 'a1', name: 'phone', label: 'Mobile number' }]);
		expect(value.items[0].name).toBe('phone');
	});

	it('should never let a derived name take a stored one', () => {
		const value = cmsFormFields.normalize([
			{ id: 'new', label: 'Name' },
			{ id: 'old', name: 'name', label: 'Your name' },
			{ id: 'new2', label: 'Name' }
		]);
		expect(value.items.map((i) => [i.id, i.name])).toEqual([
			['new', 'name_2'],
			['old', 'name'],
			['new2', 'name_3']
		]);
	});

	it('should rename a duplicate stored name', () => {
		const value = cmsFormFields.normalize([
			{ id: 'a', name: 'email', label: 'Email' },
			{ id: 'b', name: 'email', label: 'Work email' }
		]);
		expect(value.items.map((i) => i.name)).toEqual(['email', 'work_email']);
	});

	it('should keep the name across a write of the normalized value', () => {
		// What the popover does: open on the normalized value, edit, save it whole.
		const first = cmsFormFields.normalize([{ id: 'a1', label: 'Phone' }]);
		const edited = { ...first, items: [{ ...first.items[0], label: 'Mobile' }] };
		expect(cmsFormFields.normalize(edited).items[0].name).toBe('phone');
	});

	it('should translate labels, placeholders and choices', () => {
		const value = cmsFormFields.normalize([
			{ id: 'a', name: 'size', label: 'Size', placeholder: 'Pick one', options: ['S', 'M'] }
		]);
		expect(translatableFields(value, cmsFormFields).map((f) => f.field)).toEqual([
			'label',
			'placeholder',
			'options.0',
			'options.1'
		]);
	});

	it('should apply a locale overlay without touching names', () => {
		const value = cmsFormFields.read(
			{
				v: 1,
				items: [{ id: 'a', name: 'name', label: 'Name' }],
				$t: { a: { label: 'Nombre' } }
			},
			undefined
		);
		expect(value.items[0]).toMatchObject({ name: 'name', label: 'Nombre' });
	});
});

describe('cmsWhatsApp', () => {
	it('should normalize anything to the shape', () => {
		expect(cmsWhatsApp.normalize(null)).toEqual({ v: 1, number: '', message: '' });
		expect(cmsWhatsApp.normalize({ number: '+1 555', message: 'Hi {name}' })).toEqual({
			v: 1,
			number: '+1 555',
			message: 'Hi {name}'
		});
	});

	it('should translate the message but not the number', () => {
		const value = cmsWhatsApp.normalize({ number: '+1 555', message: 'Hi {name}' });
		expect(translatableFields(value, cmsWhatsApp)).toEqual([
			{ id: '_', field: 'message', source: 'Hi {name}' }
		]);
	});
});
