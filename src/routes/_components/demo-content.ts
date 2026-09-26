/**
 * Fallback content for the showcase's structured components. In a template
 * this lives in `content/<locale>.json` and the plugin injects it; here it is
 * inline so the showcase renders without a seeded backend.
 */
import type {
	CmsContactValue,
	CmsHoursValue,
	CmsPricingValue,
	CollectionItem,
	NavItem,
	FaqItem,
	GalleryItem,
	LogoItem,
	ScheduleItem,
	SocialLink,
	StatItem,
	StepItem,
	TeamMember,
	Testimonial,
	TimelineItem
} from '$lib/index.js';

const to = (routeId: string) => ({ routeId, params: {} });
const nav = (id: string, label: string, link: NavItem['link']): NavItem => ({
	id,
	label,
	link,
	children: []
});

export const demoPrimaryNav: NavItem[] = [
	nav('about', 'About', to('/(marketing)/about')),
	{
		...nav('rooms', 'Rooms', to('/(marketing)/rooms')),
		children: [
			nav('suite-1', 'Balcony Suite', {
				routeId: '/(marketing)/rooms/[slug]',
				params: { slug: 'suite-1' }
			}),
			nav('suite-2', 'Garden Room', {
				routeId: '/(marketing)/rooms/[slug]',
				params: { slug: 'suite-2' }
			})
		]
	},
	nav('contact', 'Contact', to('/(marketing)/contact')),
	nav('structured', 'Components', { href: '/structured' }),
	nav('dashboard', 'Dashboard', to('/(app)/dashboard'))
];

export const demoFooterNav: NavItem[] = [
	nav('about', 'About', to('/(marketing)/about')),
	nav('contact', 'Contact', to('/(marketing)/contact')),
	nav('github', 'GitHub', { href: 'https://github.com/velastack/cms', newTab: true })
];

const range = (open: string, close: string) => ({ closed: false, ranges: [{ open, close }] });

export const demoHours: Partial<CmsHoursValue> = {
	timezone: 'Europe/Madrid',
	days: {
		mon: range('09:00', '18:00'),
		tue: range('09:00', '18:00'),
		wed: range('09:00', '18:00'),
		thu: range('09:00', '18:00'),
		fri: {
			closed: false,
			ranges: [
				{ open: '09:00', close: '14:00' },
				{ open: '17:00', close: '22:00' }
			]
		},
		sat: range('10:00', '14:00'),
		sun: { closed: true, ranges: [] }
	},
	note: 'Closed on public holidays.',
	exceptions: [{ id: 'xmas', date: '2026-12-25', label: 'Christmas Day', closed: true, ranges: [] }]
};

export const demoContact: Partial<CmsContactValue> = {
	name: 'Casa Vela',
	address: {
		lines: ['Calle Mayor 12'],
		locality: 'Madrid',
		region: '',
		postcode: '28013',
		country: 'Spain'
	},
	phones: [{ id: 'desk', label: 'Front desk', number: '+34 910 000 000' }],
	emails: [{ id: 'hello', label: 'Bookings', address: 'hello@casavela.example' }],
	whatsapp: '+34 600 000 000',
	geo: { lat: 40.4168, lng: -3.7038 }
};

export const demoSocial: SocialLink[] = [
	{ id: 'ig', platform: 'instagram', url: 'https://instagram.com/casavela', label: '' },
	{ id: 'fb', platform: 'facebook', url: 'https://facebook.com/casavela', label: '' },
	{ id: 'ta', platform: 'tripadvisor', url: 'https://tripadvisor.com/casavela', label: 'Reviews' }
];

const photo = (seed: string, alt: string) => ({
	url: `https://picsum.photos/seed/${seed}/640/480`,
	alt
});

export const demoTeam: TeamMember[] = [
	{
		id: 'ana',
		name: 'Ana Ruiz',
		role: 'Owner & host',
		bio: '<p>Ana opened Casa Vela in 2014 after a decade running kitchens in Lisbon.</p>',
		photo: photo('ana', 'Ana Ruiz'),
		email: 'ana@casavela.example',
		phone: '',
		links: [{ id: 'li', platform: 'linkedin', url: 'https://linkedin.com/in/ana' }]
	},
	{
		id: 'tomas',
		name: 'Tomás Vidal',
		role: 'Head chef',
		bio: '<p>Seasonal menus, wood fire, no shortcuts.</p>',
		photo: photo('tomas', 'Tomás Vidal'),
		email: '',
		phone: '',
		links: []
	}
];

export const demoTestimonials: Testimonial[] = [
	{
		id: 't1',
		quote: '<p>The quietest street in the centre and the best breakfast we had in Spain.</p>',
		author: 'Marta K.',
		role: 'Guest',
		company: '',
		photo: null,
		rating: 5,
		source: { label: 'Google', url: 'https://maps.google.com' },
		date: '2026-05-02'
	},
	{
		id: 't2',
		quote: '<p>Ana went out of her way to book us a table we could not get ourselves.</p>',
		author: 'Daniel & Priya',
		role: '',
		company: '',
		photo: null,
		rating: 4,
		source: { label: '', url: '' },
		date: ''
	}
];

export const demoCollection: CollectionItem[] = [
	{
		id: 'suite-1',
		title: 'Balcony Suite',
		summary: 'A king bed, a claw-foot bath and a balcony over the courtyard.',
		body: '',
		image: photo('suite1', 'Balcony Suite'),
		gallery: [],
		price: { amount: 180, currency: 'EUR', period: 'night', prefix: 'from' },
		duration: '',
		link: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'suite-1' } },
		tags: ['suite'],
		features: ['King bed', 'Balcony', 'Bath'],
		featured: true,
		hidden: false,
		details: [
			{ id: 'sleeps', label: 'Sleeps', value: '2' },
			{ id: 'size', label: 'Size', value: '34 m²' }
		]
	},
	{
		id: 'suite-2',
		title: 'Garden Room',
		summary: 'Ground floor, opens straight onto the garden.',
		body: '',
		image: photo('suite2', 'Garden Room'),
		gallery: [],
		price: { amount: 120, currency: 'EUR', period: 'night', prefix: 'from' },
		duration: '',
		link: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'suite-2' } },
		tags: ['room'],
		features: ['Queen bed', 'Garden access'],
		featured: false,
		hidden: false,
		details: [{ id: 'sleeps', label: 'Sleeps', value: '2' }]
	},
	{
		id: 'loft',
		title: 'The Loft',
		summary: 'Two bedrooms under the eaves for families.',
		body: '',
		image: photo('loft', 'The Loft'),
		gallery: [],
		price: { amount: 240, currency: 'EUR', period: 'night', prefix: 'from' },
		duration: '',
		link: null,
		tags: ['suite', 'family'],
		features: [],
		featured: true,
		hidden: false,
		details: [{ id: 'sleeps', label: 'Sleeps', value: '4' }]
	}
];

export const demoPricing: CmsPricingValue = {
	v: 1,
	currency: 'EUR',
	labels: { custom: 'Ask us' },
	items: [
		{
			id: 'bb',
			name: 'Bed & breakfast',
			price: { amount: 120, custom: false, period: 'night' },
			description: 'Room and breakfast in the courtyard.',
			features: [
				{ id: 'f1', text: 'Breakfast', included: true },
				{ id: 'f2', text: 'Late checkout', included: false }
			],
			cta: { routeId: '/(marketing)/contact', params: {} },
			highlighted: false,
			badge: ''
		},
		{
			id: 'hb',
			name: 'Half board',
			price: { amount: 165, custom: false, period: 'night' },
			description: 'Breakfast and a three-course dinner.',
			features: [
				{ id: 'f1', text: 'Breakfast', included: true },
				{ id: 'f3', text: 'Dinner', included: true },
				{ id: 'f2', text: 'Late checkout', included: true }
			],
			cta: { routeId: '/(marketing)/contact', params: {} },
			highlighted: true,
			badge: 'Most popular'
		},
		{
			id: 'whole',
			name: 'Whole house',
			price: { amount: null, custom: true, period: '' },
			description: 'All seven rooms, staff included.',
			features: [{ id: 'f4', text: 'Private chef', included: true }],
			cta: { href: 'mailto:hello@casavela.example' },
			highlighted: false,
			badge: ''
		}
	]
};

export const demoFaq: FaqItem[] = [
	{
		id: 'parking',
		question: 'Is there parking?',
		answer: '<p>Yes, two spaces in the courtyard. Book ahead.</p>'
	},
	{
		id: 'pets',
		question: 'Are dogs welcome?',
		answer: '<p>Small dogs in the garden rooms only.</p>'
	},
	{
		id: 'checkin',
		question: 'When can we check in?',
		answer: '<p>From 3pm. Earlier on request.</p>'
	}
];

export const demoStats: StatItem[] = [
	{ id: 'rooms', value: '7', label: 'Rooms', note: '' },
	{ id: 'years', value: '12', label: 'Years open', note: 'Since 2014' },
	{ id: 'rating', value: '4.9', label: 'Guest rating', note: '312 reviews' }
];

export const demoSteps: StepItem[] = [
	{
		id: 's1',
		title: 'Pick your dates',
		body: '<p>Check availability on the rooms page.</p>',
		image: null
	},
	{
		id: 's2',
		title: 'Tell us about you',
		body: '<p>Allergies, arrival time, anything we should know.</p>',
		image: null
	},
	{ id: 's3', title: 'Arrive', body: '<p>We meet you at the door.</p>', image: null }
];

export const demoTimeline: TimelineItem[] = [
	{
		id: '2014',
		date: '2014',
		title: 'Doors open',
		body: '<p>Three rooms and a courtyard.</p>',
		image: null
	},
	{
		id: '2019',
		date: '2019',
		title: 'The loft',
		body: '<p>We took over the attic next door.</p>',
		image: null
	},
	{
		id: '2024',
		date: '2024',
		title: 'Restaurant',
		body: '<p>Tomás joins and dinner becomes a thing.</p>',
		image: null
	}
];

export const demoGallery: GalleryItem[] = [
	{ id: 'g1', image: photo('court', 'The courtyard'), caption: 'The courtyard' },
	{ id: 'g2', image: photo('bath', 'Claw-foot bath'), caption: 'Claw-foot bath' },
	{ id: 'g3', image: photo('break', 'Breakfast'), caption: 'Breakfast' }
];

export const demoLogos: LogoItem[] = [
	{
		id: 'l1',
		image: { url: 'https://picsum.photos/seed/l1/200/80', alt: 'Slow Travel' },
		name: 'Slow Travel',
		link: { href: 'https://example.com/slow' }
	},
	{
		id: 'l2',
		image: { url: 'https://picsum.photos/seed/l2/200/80', alt: 'Madrid Weekly' },
		name: 'Madrid Weekly',
		link: null
	}
];

export const demoSchedule: ScheduleItem[] = [
	{
		id: 'y1',
		day: 'Monday',
		time: '08:00',
		title: 'Rooftop yoga',
		body: '',
		location: 'Roof terrace'
	},
	{
		id: 'w1',
		day: 'Wednesday',
		time: '18:00',
		title: 'Wine tasting',
		body: '<p>Five wines, one cheese board.</p>',
		location: 'Courtyard'
	},
	{
		id: 'y2',
		day: 'Friday',
		time: '08:00',
		title: 'Rooftop yoga',
		body: '',
		location: 'Roof terrace'
	}
];
