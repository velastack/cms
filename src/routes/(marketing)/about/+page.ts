import { definePageMetaTags } from 'svelte-meta-tags';

export const load = async () => {
	const metaTags = definePageMetaTags({
		title: 'About'
	});

	return { ...metaTags };
};
