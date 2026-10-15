/** `CmsWhatsAppForm`: the number a form's answers go to, and how they read. */
import { asString, isPlainObject } from '../structured.js';
import { defineForm } from './form.js';

export type CmsWhatsAppValue = {
	v: 1;
	/** International format; anything but digits is dropped when linking. */
	number: string;
	/** The message, with `{field}` placeholders for the visitor's answers. */
	message: string;
};

export const cmsWhatsApp = defineForm<CmsWhatsAppValue>({
	component: 'CmsWhatsAppForm',
	label: 'WhatsApp',
	version: 1,
	translatable: ['message'],
	normalize: (raw) => {
		const r = isPlainObject(raw) ? raw : {};
		return { v: 1, number: asString(r.number), message: asString(r.message) };
	},
	empty: () => ({ v: 1, number: '', message: '' }),
	fields: [
		{
			key: 'number',
			label: 'WhatsApp number',
			type: 'text',
			placeholder: '+1 555 010 0199'
		},
		{
			key: 'message',
			label: 'Message',
			type: 'long-string',
			placeholder: "Hi, I'm {name}…"
		}
	]
});
