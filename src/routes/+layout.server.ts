import { loadCms } from '$lib/cms.js';
import { error } from '@sveltejs/kit';
import { defineBaseMetaTags } from 'svelte-meta-tags';

export const prerender = true;

export const load = async (event) => {
	const { baseMetaTags } = defineBaseMetaTags({
		title: 'Velastack CMS',
		titleTemplate: '%s · Velastack CMS'
	});

	const { cms, notFound } = await loadCms(event);
	if (notFound) error(404, 'Not found');

	return {
		cms,
		baseMetaTags
	};
};
