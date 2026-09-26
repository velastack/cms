/**
 * `CmsNav`: a navigation list with one level of children (footer columns).
 * Labels translate; links do not. Rendered by the template from `navView`,
 * which resolves every link to an `href`.
 */
import type { Tree } from '../path.js';
import { asBoolean, asItems, asString, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';
import { asLink, linkHref, type CmsLinkValue } from './link.js';

export type NavItem = {
	id: string;
	label: string;
	link: CmsLinkValue | null;
	children: NavItem[];
};

export type CmsNavValue = ListValue<NavItem>;

export type NavItemView = {
	id: string;
	label: string;
	href: string;
	newTab: boolean;
	children: NavItemView[];
};

const normalizeItem = (raw: Tree, depth: number): Omit<NavItem, 'id'> => ({
	label: asString(raw.label),
	link: asLink(raw.link),
	children:
		depth === 0 ? asItems<NavItem>(raw.children, (child) => normalizeItem(child, depth + 1)) : []
});

const blankItem = (): Tree => ({ label: '', link: null, children: [] });

const linkField = { key: 'link', label: 'Link', type: 'link' } as const;

export const cmsNav = defineForm<CmsNavValue>({
	component: 'CmsNav',
	label: 'Navigation',
	version: 1,
	translatable: [],
	items: {
		key: 'items',
		translatable: ['label'],
		items: { key: 'children', translatable: ['label'] }
	},
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return { v: 1, items: asItems<NavItem>(items, (item) => normalizeItem(item, 0)) };
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Links',
			type: 'list',
			itemLabel: 'link',
			titleKey: 'label',
			blank: blankItem,
			fields: [
				{ key: 'label', label: 'Label', type: 'text' },
				linkField,
				{
					key: 'children',
					label: 'Sub-links',
					type: 'list',
					itemLabel: 'sub-link',
					titleKey: 'label',
					blank: blankItem,
					fields: [{ key: 'label', label: 'Label', type: 'text' }, linkField]
				}
			]
		}
	]
});

const viewItem = (item: NavItem): NavItemView => ({
	id: item.id,
	label: item.label,
	href: linkHref(item.link, '#'),
	newTab: asBoolean(item.link?.newTab),
	children: item.children.map(viewItem)
});

/** Items with resolved hrefs, dropping items that have no label. */
export const navView = (value: CmsNavValue): NavItemView[] =>
	value.items.filter((i) => i.label !== '').map(viewItem);

/** Whether `item` (or one of its children) points at the current page. */
export const isActive = (item: NavItemView, url: URL | string): boolean => {
	const pathname = typeof url === 'string' ? url : url.pathname;
	const path = pathname.replace(/\/+$/, '') || '/';
	const href = item.href.replace(/\/+$/, '') || '/';
	if (href === '#') return false;
	if (href === path) return true;
	if (href !== '/' && path.startsWith(href + '/')) return true;
	return item.children.some((c) => isActive(c, url));
};
