import { loadCms } from '$lib/cms.js';
import { error, redirect } from '@sveltejs/kit';
import { defineBaseMetaTags } from 'svelte-meta-tags';
import { getLocale } from '$locales/main.url.js';

export const prerender = true;

export const load = async (event) => {
	const locale = getLocale(event.url);

	const { baseMetaTags } = defineBaseMetaTags({
		title: 'Velastack CMS',
		titleTemplate: '%s · Velastack CMS'
	});

	const { cms, notFound, gone, redirectTo } = await loadCms(event, { locale });
	console.log(redirectTo, gone, notFound);
	if (redirectTo) redirect(308, redirectTo);
	if (gone) error(410, 'Gone');
	if (notFound) error(404, 'Not found');

	return {
		cms,
		baseMetaTags
	};
};
