import { describe, expect, it } from 'vitest';
import { translatableFields } from '../structured.js';
import { getStructured } from '../structured-registry.js';
import { cmsNav, isActive, navView } from './nav.js';
import { cmsSocialLinks, socialLinksView, toSameAs } from './social-links.js';
import { cmsFaq, faqView, toFaqPage } from './faq.js';
import { cmsTeam, teamView } from './team.js';
import { cmsTestimonials, testimonialsView, toReview } from './testimonials.js';
import {
	cmsCollection,
	collectionTags,
	collectionView,
	formatCollectionPrice
} from './collection.js';
import { cmsPricing, formatPrice, pricingView } from './pricing.js';
import {
	cmsGallery,
	cmsLogos,
	cmsSchedule,
	cmsStats,
	logosView,
	scheduleByDay
} from './presets.js';
import './index.js';

describe('registry', () => {
	it('registers every exported component', () => {
		for (const c of [
			'CmsNav',
			'CmsHours',
			'CmsContact',
			'CmsSocialLinks',
			'CmsTeam',
			'CmsTestimonials',
			'CmsCollection',
			'CmsPricing',
			'CmsFaq',
			'CmsStats',
			'CmsSteps',
			'CmsTimeline',
			'CmsGallery',
			'CmsLogos',
			'CmsSchedule'
		]) {
			expect(getStructured(c)?.component, c).toBe(c);
		}
	});
});

describe('cmsNav', () => {
	const value = cmsNav.normalize({
		items: [
			{ id: 'home', label: 'Home', link: { routeId: '/', params: {} } },
			{
				id: 'rooms',
				label: 'Rooms',
				link: { routeId: '/(marketing)/rooms', params: {} },
				children: [
					{
						id: 'suite',
						label: 'Suite',
						link: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'suite-1' } },
						children: [{ id: 'deep', label: 'Too deep' }]
					}
				]
			},
			{ id: 'ext', label: 'Blog', link: { href: 'https://blog.example', newTab: true } },
			{ id: 'blank', label: '' }
		]
	});

	it('accepts a bare array and keeps one level of children', () => {
		expect(cmsNav.normalize([{ label: 'A' }]).items[0]).toEqual({
			id: 'item-0',
			label: 'A',
			link: null,
			children: []
		});
		expect(value.items[1].children[0].children).toEqual([]);
	});

	it('resolves hrefs and drops unlabeled items', () => {
		const view = navView(value);
		expect(view.map((i) => i.href)).toEqual(['/', '/rooms', 'https://blog.example']);
		expect(view[1].children[0].href).toBe('/rooms/suite-1');
		expect(view[2].newTab).toBe(true);
	});

	it('knows the active item', () => {
		const view = navView(value);
		expect(isActive(view[0], '/')).toBe(true);
		expect(isActive(view[0], '/rooms')).toBe(false);
		expect(isActive(view[1], new URL('https://x/rooms/suite-1'))).toBe(true);
		expect(isActive(view[1], '/roomsx')).toBe(false);
	});

	it('translates labels at both levels', () => {
		expect(translatableFields(value, cmsNav).map((f) => `${f.id}.${f.field}`)).toEqual([
			'home.label',
			'rooms.label',
			'suite.label',
			'ext.label'
		]);
	});
});

describe('cmsSocialLinks', () => {
	it('defaults labels to the platform name and drops empty urls', () => {
		const v = cmsSocialLinks.normalize([
			{ id: 'ig', platform: 'instagram', url: 'https://instagram.com/x' },
			{ id: 'tt', platform: 'myspace', url: 'https://myspace.com/x', label: 'Old' },
			{ id: 'no', platform: 'facebook', url: '' }
		]);
		expect(socialLinksView(v).map((l) => [l.platform, l.name])).toEqual([
			['instagram', 'Instagram'],
			['other', 'Old']
		]);
		expect(toSameAs(v)).toEqual(['https://instagram.com/x', 'https://myspace.com/x']);
	});
});

describe('cmsFaq', () => {
	it('hides incomplete questions and builds FAQPage', () => {
		const v = cmsFaq.normalize({
			items: [
				{ id: 'a', question: 'Parking?', answer: '<p>Yes.</p>' },
				{ id: 'b', question: 'Empty', answer: '<p></p>' }
			]
		});
		expect(faqView(v)).toHaveLength(1);
		expect(toFaqPage(v)).toEqual({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: [
				{
					'@type': 'Question',
					name: 'Parking?',
					acceptedAnswer: { '@type': 'Answer', text: '<p>Yes.</p>' }
				}
			]
		});
	});
});

describe('cmsTeam', () => {
	it('normalizes photos and profile links', () => {
		const v = cmsTeam.normalize([
			{
				id: 'ana',
				name: 'Ana',
				role: 'Chef',
				photo: 'https://img/ana.jpg',
				links: [{ platform: 'linkedin', url: 'https://l/ana' }]
			},
			{ name: '' }
		]);
		expect(v.items[0].photo).toEqual({ url: 'https://img/ana.jpg' });
		expect(v.items[0].links[0]).toEqual({
			id: 'item-0',
			platform: 'linkedin',
			url: 'https://l/ana'
		});
		expect(teamView(v)).toHaveLength(1);
	});
});

describe('cmsTestimonials', () => {
	it('clamps ratings and builds Review', () => {
		const v = cmsTestimonials.normalize([
			{
				id: 'q',
				quote: '<p>Lovely.</p>',
				author: 'Sam',
				rating: '5',
				date: '2026-01-02',
				source: { label: 'Google' }
			},
			{ id: 'r', quote: 'x', rating: 9 }
		]);
		expect(v.items[0].rating).toBe(5);
		expect(v.items[1].rating).toBeNull();
		expect(toReview(v.items[0])).toEqual({
			'@type': 'Review',
			reviewBody: 'Lovely.',
			author: { '@type': 'Person', name: 'Sam' },
			reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5 },
			datePublished: '2026-01-02',
			publisher: { '@type': 'Organization', name: 'Google' }
		});
		expect(testimonialsView(v)).toHaveLength(2);
	});
});

describe('cmsCollection', () => {
	const v = cmsCollection.normalize({
		items: [
			{
				id: 'a',
				title: 'Suite',
				featured: true,
				tags: ['sea', ''],
				price: { amount: 120, currency: 'EUR', period: 'night', prefix: 'from' },
				link: { routeId: '/(marketing)/rooms/[slug]', params: { slug: 'suite-1' } },
				details: [{ id: 'd', label: 'Sleeps', value: '4' }]
			},
			{ id: 'b', title: 'Loft', tags: ['city'] },
			{ id: 'c', title: 'Hidden', hidden: true },
			{ id: 'd', title: '' }
		]
	});

	it('slices visible items', () => {
		expect(collectionView(v).map((i) => i.id)).toEqual(['a', 'b']);
		expect(collectionView(v, { featured: true }).map((i) => i.id)).toEqual(['a']);
		expect(collectionView(v, { tag: 'city' }).map((i) => i.id)).toEqual(['b']);
		expect(collectionView(v, { limit: 1 })).toHaveLength(1);
		expect(collectionView(v)[0].href).toBe('/rooms/suite-1');
		expect(collectionView(v)[1].href).toBeNull();
		expect(collectionTags(v)).toEqual(['sea', 'city']);
	});

	it('formats prices', () => {
		expect(formatCollectionPrice(v.items[0].price, 'en-IE')).toBe('from €120 / night');
		expect(formatCollectionPrice(v.items[1].price, 'en')).toBe('');
		expect(formatCollectionPrice({ amount: 9.5, currency: '', period: '', prefix: '' }, 'en')).toBe(
			'9.5'
		);
	});

	it('translates nested details and string arrays', () => {
		const fields = translatableFields(v, cmsCollection).map((f) => `${f.id}.${f.field}`);
		expect(fields).toContain('a.tags.0');
		expect(fields).toContain('d.label');
		expect(fields).toContain('a.price.period');
	});
});

describe('cmsPricing', () => {
	const v = cmsPricing.normalize({
		currency: 'USD',
		items: [
			{
				id: 'basic',
				name: 'Basic',
				price: { amount: 29, period: 'month' },
				features: [
					{ id: 'f', text: 'Email support' },
					{ text: 'Phone', included: false }
				]
			},
			{
				id: 'ent',
				name: 'Enterprise',
				price: { amount: 'custom' },
				cta: { href: 'mailto:sales@x' }
			}
		]
	});

	it('formats amounts and custom prices', () => {
		const view = pricingView(v, 'en-US');
		expect(view[0].priceText).toBe('$29 / month');
		expect(view[1].priceText).toBe('Custom');
		expect(view[1].href).toBe('mailto:sales@x');
		expect(v.items[0].features[1]).toEqual({ id: 'item-1', text: 'Phone', included: false });
		expect(formatPrice(v.items[0], { currency: '', labels: { custom: 'x' } }, 'en')).toBe(
			'29 / month'
		);
	});

	it('translates the custom label and feature text', () => {
		const fields = translatableFields(v, cmsPricing).map((f) => `${f.id}.${f.field}`);
		expect(fields).toEqual([
			'_.labels.custom',
			'basic.name',
			'basic.price.period',
			'f.text',
			'item-1.text',
			'ent.name'
		]);
	});
});

describe('presets', () => {
	it('normalize bare arrays', () => {
		expect(cmsStats.normalize([{ value: '12k', label: 'Guests' }]).items[0]).toEqual({
			id: 'item-0',
			value: '12k',
			label: 'Guests',
			note: ''
		});
		expect(
			cmsGallery.normalize([{ src: 'https://i/1.jpg', caption: 'One' }]).items[0].image
		).toEqual({ url: 'https://i/1.jpg' });
	});
	it('logos need an image', () => {
		const v = cmsLogos.normalize([
			{ name: 'A', image: 'https://i/a.svg', link: { href: 'https://a' } },
			{ name: 'B' }
		]);
		expect(logosView(v).map((l) => [l.name, l.href])).toEqual([['A', 'https://a']]);
	});
	it('groups the schedule by day', () => {
		const v = cmsSchedule.normalize([
			{ day: 'Mon', title: 'Yoga' },
			{ day: 'Tue', title: 'Run' },
			{ day: 'Mon', title: 'Swim' },
			{ day: 'Mon', title: '' }
		]);
		expect(scheduleByDay(v).map((g) => [g.day, g.items.length])).toEqual([
			['Mon', 2],
			['Tue', 1]
		]);
	});
});
