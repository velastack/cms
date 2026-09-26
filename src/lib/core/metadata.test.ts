import { describe, expect, it } from 'vitest';
import { toMetaTags } from './metadata.js';

describe('toMetaTags', () => {
	it('maps search fields and derives share fields from them', () => {
		expect(
			toMetaTags({ title: 'Rooms', description: 'Stay with us' }, { siteName: 'Alcove' })
		).toEqual({
			title: 'Rooms',
			titleTemplate: '%s · Alcove',
			description: 'Stay with us',
			openGraph: { title: 'Rooms', description: 'Stay with us', siteName: 'Alcove' },
			twitter: { title: 'Rooms', description: 'Stay with us' }
		});
	});

	it('uses explicit share fields, image objects and the twitter card', () => {
		const out = toMetaTags({
			title: 'Rooms',
			ogTitle: 'Our rooms',
			ogImage: { url: 'https://x/og.jpg', alt: 'Lobby' },
			twitterCard: 'summary',
			canonical: 'https://x/rooms',
			noindex: true
		});
		expect(out.openGraph).toEqual({
			title: 'Our rooms',
			url: 'https://x/rooms',
			images: [{ url: 'https://x/og.jpg', alt: 'Lobby' }]
		});
		expect(out.twitter).toEqual({
			cardType: 'summary',
			title: 'Our rooms',
			image: 'https://x/og.jpg'
		});
		expect(out.canonical).toBe('https://x/rooms');
		expect(out.robots).toBe('noindex, nofollow');
	});

	it('defaults the card to summary_large_image when an image is set, and ignores blanks', () => {
		expect(toMetaTags({ ogImage: 'https://x/og.jpg', title: '' }, { url: 'https://x/' })).toEqual({
			openGraph: { url: 'https://x/', images: [{ url: 'https://x/og.jpg' }] },
			twitter: { cardType: 'summary_large_image', image: 'https://x/og.jpg' }
		});
		expect(toMetaTags({})).toEqual({});
	});
});
