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
 * rooms that were renamed or retired, and the company profile. A scope with route params
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

// The company profile (Site → Company): the harbour house, with the contact
// details and hours the root layout already holds, and a second house in
// Lisbon with its own number and shorter hours.
const { contact, hours, social } = (en as Content)['layout:/'] as Record<string, Tree>;
const day = (open: string, close: string) => ({ closed: false, ranges: [{ open, close }] });

demoSeed.site = {
	...demoSeed.site,
	company: {
		v: 1,
		name: contact.name,
		legalName: 'Casa Marea, Lda.',
		tagline: 'A small hotel on the harbour',
		description: 'Twelve rooms above the fishing harbour in Ericeira, and four more in Lisbon.',
		type: 'Hotel',
		priceRange: '$$',
		languages: ['pt', 'en', 'es'],
		paymentMethods: ['Cash', 'Visa', 'Mastercard'],
		areaServed: [],
		phones: contact.phones,
		emails: contact.emails,
		whatsapp: contact.whatsapp,
		website: 'https://casamarea.example',
		bookingUrl: 'https://casamarea.example/book',
		social: social.items,
		locations: [
			{
				id: 'ericeira',
				name: 'Ericeira',
				address: contact.address,
				geo: contact.geo,
				directions: 'Street parking on Rua do Cais. The entrance is the blue door.',
				hours
			},
			{
				id: 'lisboa',
				name: 'Lisboa',
				address: {
					lines: ['Rua da Bica 12'],
					locality: 'Lisboa',
					region: 'Lisboa',
					postcode: '1200-057',
					country: 'Portugal'
				},
				geo: { lat: 38.7107, lng: -9.1462 },
				directions: 'Two minutes from the Bica funicular. No parking on the street.',
				phones: [{ id: 'lisboa', label: 'Reception', number: '+351 210 000 000' }],
				hours: {
					timezone: 'Europe/Lisbon',
					days: {
						mon: day('08:00', '20:00'),
						tue: day('08:00', '20:00'),
						wed: day('08:00', '20:00'),
						thu: day('08:00', '20:00'),
						fri: day('08:00', '22:00'),
						sat: day('09:00', '22:00'),
						sun: { closed: true, ranges: [] }
					}
				}
			}
		]
	}
};
