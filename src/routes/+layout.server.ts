import { loadCmsForRoute, type FetchCmsDocs } from '$lib/server/load-cms.js';

/**
 * Mock document store, keyed by composed scopeKey. Stands in for a real
 * backend until the CMS adapter lands. The plugin-generated manifest
 * determines which of these get queried for any given route.
 */
const MOCK_DOCS: Record<string, Record<string, unknown>> = {
	'layout:/': {
		'footer.links': [
			{ href: '/', label: 'Home' },
			{ href: '/about', label: 'About' },
			{ href: '/dashboard', label: 'Dashboard' }
		]
	},
	'page:/': {
		'welcome.title': 'Velastack CMS test harness',
		'welcome.body':
			'<p>Pick a section: marketing pages live under <a href="/about">/about</a> and <a href="/rooms/suite-1">/rooms/[slug]</a>; the app shell lives under <a href="/dashboard">/dashboard</a>.</p>'
	},
	'layout:/(marketing)': {
		'header.title': 'VelaStack CMS',
		'announcement.text': 'Spring rates are live — book by April 30.'
	},
	'page:/(marketing)/about': {
		'hero.title': 'About VelaStack CMS',
		body: '<p>A zero-config CMS for SvelteKit. This page is rendered through the marketing layout, so its CMS fields live under the <code>page:/(marketing)/about</code> scope.</p>'
	},
	'page:/(marketing)/rooms/[slug]?slug=suite-1': {
		'hero.title': 'Suite 1 — Cliffside',
		'hero.image': 'https://placehold.co/960x420?text=Suite+1',
		'gallery.items': [
			{ src: 'https://placehold.co/400x300?text=View+1', caption: 'Morning light' },
			{ src: 'https://placehold.co/400x300?text=View+2', caption: 'Sunset deck' }
		]
	},
	'page:/(marketing)/rooms/[slug]?slug=suite-2': {
		'hero.title': 'Suite 2 — Garden',
		'hero.image': 'https://placehold.co/960x420?text=Suite+2',
		'gallery.items': [{ src: 'https://placehold.co/400x300?text=Garden+1', caption: 'Courtyard' }]
	},
	'layout:/(app)': {
		'header.title': 'VelaStack CMS — Admin'
	},
	'page:/(app)/dashboard': {
		'welcome.title': 'Welcome back',
		body: '<p>Operator dashboard. Same <code>Header.svelte</code>, different scope, different content.</p>'
	}
};

const fetchDocs: FetchCmsDocs = (queries) => {
	const out: Record<string, Record<string, unknown>> = {};
	for (const q of queries) {
		const doc = MOCK_DOCS[q.scopeKey];
		if (doc) out[q.scopeKey] = doc;
	}
	return out;
};

export const load = async (event) => {
	return {
		cms: await loadCmsForRoute({
			routeId: event.route.id,
			params: event.params as Record<string, string>,
			locale: 'en',
			fetchDocs
		})
	};
};
