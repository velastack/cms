import { generateEntries } from '$lib/cms.js';
import type { RouteId } from './[slug]/$types.d.ts';

export const load = async () => {
	const pages = await generateEntries('/(marketing)/rooms/[slug]' satisfies RouteId);
	return { pages };
};
