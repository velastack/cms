/**
 * The demo site's published content: Casa Marea, a small harbour hotel.
 * `npm run dev` seeds the local backend with it on first start
 * (src/dev-backend.ts); `vite build` serves it from memory (src/cms.ts), so the
 * build needs no backend at all.
 *
 * The copy lives in `content/<locale>.json`, keyed by scope id, which the Vite
 * plugin also injects as every component's `fallback`. This file turns those
 * files into a seed, the way a host seeds a project from a template's
 * `content/`, and adds what they cannot hold: one entry per room, and the
 * rooms that were renamed or retired. A scope with route params
 * (`page:/(marketing)/rooms/[slug]`) is the room template's fallbacks, not a
 * page, so it is never seeded.
 */
import type { CmsSeed, PageEntry } from '#lib/backend/index.js';
import en from '../content/en.json' with { type: 'json' };
import es from '../content/es.json' with { type: 'json' };

type Tree = Record<string, unknown>;
type Content = Record<string, Tree>;

const ROOM = '/(marketing)/rooms/[slug]';

const img = (file: string, alt: string) => ({ url: `/demo/${file}.jpg`, alt });

const rooms: PageEntry[] = [
	{
		params: { slug: 'balcony-suite' },
		published: {
			metadata: {
				title: 'Balcony Suite',
				description: 'A king bed and a balcony over the harbour.',
				price_per_night: 180,
				max_guests: 2,
				bed_type: 'king',
				ogImage: img('balcony-suite', 'The Balcony Suite')
			},
			hero: { image: img('balcony-suite', 'White linen on the Balcony Suite bed') },
			summary: 'Our best room: a king bed, a deep bath and a balcony over the harbour.',
			checkIn: '15:00',
			description:
				'## In the room\n\n- Balcony with two chairs and a view of the boats\n- Free-standing bath\n- Espresso machine and local pastries each morning\n\nThe balcony faces west, so it catches the sunset.',
			gallery: {
				items: [
					{
						id: 'view',
						image: img('harbour', 'The view from the balcony'),
						caption: 'The view from the balcony'
					},
					{
						id: 'terrace',
						image: img('terrace', 'The breakfast terrace'),
						caption: 'Breakfast is one floor down'
					}
				]
			}
		}
	},
	{
		params: { slug: 'garden-room' },
		published: {
			metadata: {
				title: 'Garden Room',
				description: 'Ground floor, with doors onto the garden.',
				price_per_night: 120,
				max_guests: 2,
				bed_type: 'queen'
			},
			hero: { image: img('garden-room', 'Morning light on the Garden Room bed') },
			// No photos yet: an explicit empty, so the template's sample gallery
			// does not stand in for them.
			gallery: null,
			summary: 'Ground floor, quiet, with doors straight onto the garden.',
			checkIn: '15:00',
			description:
				'## In the room\n\n- Queen bed\n- Walk-in shower\n- Doors onto the garden\n\nDogs are welcome in this room.'
		}
	},
	{
		params: { slug: 'the-loft' },
		published: {
			metadata: {
				title: 'The Loft',
				description: 'Two bedrooms under the roof, for families.',
				price_per_night: 240,
				max_guests: 4,
				bed_type: 'twin'
			},
			hero: { image: img('loft', 'The Loft bedroom') },
			gallery: null,
			summary: 'Two bedrooms under the eaves, with a kitchenette. Good for families.',
			checkIn: '16:00',
			description:
				'## In the room\n\n- One king and one twin bedroom\n- Kitchenette\n- Skylights over both beds'
		}
	},
	// The suite's address before it was renamed. Old links get a
	// permanent redirect instead of a 404.
	{
		params: { slug: 'suite-1' },
		published: {},
		tombstone: { kind: 'redirect', to: '/rooms/balcony-suite' }
	},
	// A room that was retired: 410 Gone where a server answers, and
	// simply not written by the static build.
	{
		params: { slug: 'the-boathouse' },
		published: {},
		tombstone: { kind: 'gone' }
	}
];

const fromContent = (seed: CmsSeed, locale: string, content: Content) => {
	for (const [scopeId, tree] of Object.entries(content)) {
		if (scopeId === 'site') {
			seed.site = tree;
			continue;
		}
		const [kind, routeId] = [
			scopeId.slice(0, scopeId.indexOf(':')),
			scopeId.slice(scopeId.indexOf(':') + 1)
		];
		if (kind === 'layout') ((seed.layouts ??= {})[locale] ??= {})[routeId] = tree;
		else if (kind === 'page' && !routeId.includes('['))
			((seed.pages ??= {})[locale] ??= {})[routeId] = tree;
	}
};

export const demoSeed: CmsSeed = { pages: { en: { [ROOM]: rooms } } };
fromContent(demoSeed, 'en', en as Content);
fromContent(demoSeed, 'es', es as Content);
