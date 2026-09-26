/** `CmsFaq`: questions with rich answers, plus FAQPage JSON-LD. */
import { asItems, asString, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';

export type FaqItem = { id: string; question: string; answer: string };

export type CmsFaqValue = ListValue<FaqItem>;

export const cmsFaq = defineForm<CmsFaqValue>({
	component: 'CmsFaq',
	label: 'FAQ',
	version: 1,
	translatable: [],
	items: { key: 'items', translatable: ['question', 'answer'] },
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: asItems<FaqItem>(items, (r) => ({
				question: asString(r.question),
				answer: asString(r.answer)
			}))
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Questions',
			type: 'list',
			itemLabel: 'question',
			titleKey: 'question',
			blank: () => ({ question: '', answer: '' }),
			fields: [
				{ key: 'question', label: 'Question', type: 'text' },
				{ key: 'answer', label: 'Answer', type: 'html' }
			]
		}
	]
});

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '').trim();

/** Questions that have both a question and an answer. */
export const faqView = (value: CmsFaqValue): FaqItem[] =>
	value.items.filter((i) => i.question !== '' && stripTags(i.answer) !== '');

/** A schema.org `FAQPage` node for `<script type="application/ld+json">`. */
export const toFaqPage = (value: CmsFaqValue): Record<string, unknown> => ({
	'@context': 'https://schema.org',
	'@type': 'FAQPage',
	mainEntity: faqView(value).map((i) => ({
		'@type': 'Question',
		name: i.question,
		acceptedAnswer: { '@type': 'Answer', text: i.answer }
	}))
});
