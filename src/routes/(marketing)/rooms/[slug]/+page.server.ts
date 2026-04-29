import type { RouteId, RouteParams } from './$types.d.ts';
import { generateEntries } from '$lib/cms.js';

export const entries = async () => {
	// const pages = await generateEntries('/(marketing)/rooms/[slug]' satisfies RouteId);
	// return pages.map((page) => page.params);
	// or
	const pages = await generateEntries();
	return pages.map((page) => page.params as RouteParams);
};
