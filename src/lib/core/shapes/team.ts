/** `CmsTeam`: people with a portrait, a role and a rich bio. */
import { asEnum, asItems, asString, isPlainObject } from '../structured.js';
import { defineForm, type ListValue } from './form.js';
import { asImage, type CmsImageValue } from './image.js';
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_NAMES, type SocialPlatform } from './social-links.js';

export type TeamLink = { id: string; platform: SocialPlatform; url: string };

export type TeamMember = {
	id: string;
	name: string;
	role: string;
	bio: string;
	photo: CmsImageValue | null;
	email: string;
	phone: string;
	links: TeamLink[];
};

export type CmsTeamValue = ListValue<TeamMember>;

export const cmsTeam = defineForm<CmsTeamValue>({
	component: 'CmsTeam',
	label: 'Team',
	version: 1,
	translatable: [],
	items: { key: 'items', translatable: ['role', 'bio'] },
	normalize: (raw) => {
		const items = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.items : [];
		return {
			v: 1,
			items: asItems<TeamMember>(items, (r) => ({
				name: asString(r.name),
				role: asString(r.role),
				bio: asString(r.bio),
				photo: asImage(r.photo),
				email: asString(r.email),
				phone: asString(r.phone),
				links: asItems<TeamLink>(r.links, (l) => ({
					platform: asEnum(l.platform, SOCIAL_PLATFORMS, 'other'),
					url: asString(l.url)
				}))
			}))
		};
	},
	empty: () => ({ v: 1, items: [] }),
	fields: [
		{
			key: 'items',
			label: 'People',
			type: 'list',
			itemLabel: 'person',
			titleKey: 'name',
			blank: () => ({ name: '', role: '', bio: '', photo: null, email: '', phone: '', links: [] }),
			fields: [
				{ key: 'name', label: 'Name', type: 'text', half: true },
				{ key: 'role', label: 'Role', type: 'text' },
				{ key: 'photo', label: 'Portrait', type: 'image' },
				{ key: 'bio', label: 'Bio', type: 'html' },
				{ key: 'email', label: 'Email', type: 'text', half: true },
				{ key: 'phone', label: 'Phone', type: 'text' },
				{
					key: 'links',
					label: 'Profiles',
					type: 'list',
					itemLabel: 'profile',
					titleKey: 'platform',
					blank: () => ({ platform: 'linkedin', url: '' }),
					fields: [
						{
							key: 'platform',
							label: 'Platform',
							type: 'enum',
							values: SOCIAL_PLATFORMS,
							names: SOCIAL_PLATFORM_NAMES,
							half: true
						},
						{ key: 'url', label: 'URL', type: 'url' }
					]
				}
			]
		}
	]
});

/** Members with a name. */
export const teamView = (value: CmsTeamValue): TeamMember[] =>
	value.items.filter((m) => m.name !== '');
