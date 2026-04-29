import { error, type ServerLoad } from '@sveltejs/kit';
import { defineBaseMetaTags } from 'svelte-meta-tags';
import { loadCms } from '$lib/cms.js';

export const load: ServerLoad = async (event) => {
	const { baseMetaTags } = defineBaseMetaTags({
		title: 'Velastack CMS',
		titleTemplate: '%s · Velastack CMS',
		description: 'CMS test harness',
		canonical: event.url.origin + event.url.pathname
	});

	const { cms, notFound } = await loadCms(event);
	if (notFound) error(404, 'Not found');

	return {
		baseMetaTags,
		cms
	};
};
