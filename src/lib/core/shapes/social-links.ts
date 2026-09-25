/**
 * `CmsSocialLinks`: an ordered list of profiles. The template supplies the
 * icon for `platform`; `label` defaults to the platform's name.
 */
import { asEnum, asItems, asString, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';

export const SOCIAL_PLATFORMS = [
	'instagram',
	'facebook',
	'tiktok',
	'youtube',
	'linkedin',
	'x',
	'threads',
	'pinterest',
	'whatsapp',
	'tripadvisor',
	'google',
	'yelp',
	'other'
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_NAMES: Readonly<Record<SocialPlatform, string>> = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	tiktok: 'TikTok',
	youtube: 'YouTube',
	linkedin: 'LinkedIn',
	x: 'X',
	threads: 'Threads',
	pinterest: 'Pinterest',
	whatsapp: 'WhatsApp',
	tripadvisor: 'Tripadvisor',
	google: 'Google',
	yelp: 'Yelp',
	other: 'Website'
};

export type SocialLink = {
	id: string;
	platform: SocialPlatform;
	url: string;
	label: string;
};

export type CmsSocialLinksValue = ListValue<SocialLink>;

export type SocialLinkView = SocialLink & { name: string };

export const cmsSocialLinks = defineForm<CmsSocialLinksValue>({
	component: 'CmsSocialLinks',
	label: 'Social links',
	version: 1,
	translatable: [],
	items: { key: 'items', translatable: ['label'] },
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: asItems<SocialLink>(items, (r) => ({
				platform: asEnum(r.platform, SOCIAL_PLATFORMS, 'other'),
				url: asString(r.url),
				label: asString(r.label)
			}))
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'Profiles',
			type: 'list',
			itemLabel: 'profile',
			titleKey: 'platform',
			blank: () => ({ platform: 'instagram', url: '', label: '' }),
			fields: [
				{
					key: 'platform',
					label: 'Platform',
					type: 'enum',
					values: SOCIAL_PLATFORMS,
					names: SOCIAL_PLATFORM_NAMES,
					half: true
				},
				{ key: 'url', label: 'URL', type: 'url', placeholder: 'https://…' },
				{ key: 'label', label: 'Label', type: 'text', placeholder: 'Defaults to the platform name' }
			]
		}
	]
});

/** Profiles with a URL, each with a display `name` (the label, else the platform). */
export const socialLinksView = (value: CmsSocialLinksValue): SocialLinkView[] =>
	value.items
		.filter((i) => i.url !== '')
		.map((i) => ({ ...i, name: i.label || SOCIAL_PLATFORM_NAMES[i.platform] }));

/** The `sameAs` list for an Organization or LocalBusiness JSON-LD node. */
export const toSameAs = (value: CmsSocialLinksValue): string[] =>
	value.items.map((i) => i.url).filter((u) => u !== '');
