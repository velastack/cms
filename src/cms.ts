import { dev } from '$app/env';
import { createCms, apiAdapter, mockAdapter, type PageEntry } from '#lib/server/index.js';
import { locales } from '#locales/data.js';
import { demoSeed } from './demo-seed.js';

// `CMS_ENDPOINT` reads a real backend. Otherwise dev talks to the local one
// mounted at `/cms` (src/dev-backend.ts), and a build serves `demoSeed` from
// memory: no backend, and no editing on the static site.
const endpoint = process.env.CMS_ENDPOINT ?? (dev ? '/cms' : undefined);

/** Whether the site renders the admin bar: only with a backend to sign in to. */
export const editable = endpoint !== undefined;

const seedAdapter = () => {
	const pageDocs: Record<string, Record<string, PageEntry[]>> = {};
	for (const [locale, byRoute] of Object.entries(demoSeed.pages ?? {})) {
		pageDocs[locale] = {};
		for (const [routeId, value] of Object.entries(byRoute)) {
			pageDocs[locale][routeId] = Array.isArray(value) ? value : [{ params: {}, published: value }];
		}
	}
	return {
		...mockAdapter({ layoutDocs: demoSeed.layouts, pageDocs }),
		fetchSite: () => demoSeed.site ?? {}
	};
};

export const { load: loadCms, generateEntries } = createCms({
	adapter: endpoint ? apiAdapter({ endpoint }) : seedAdapter(),
	locales,
	// Site options: values that never render on the page. Branding, contact
	// and social links live in the root layout scope and are edited in place.
	site: {
		seo: {
			label: 'Search & sharing',
			fields: {
				schemaType: {
					type: 'enum',
					label: 'Business type (schema.org)',
					values: ['LocalBusiness', 'Restaurant', 'Hotel', 'Store', 'ProfessionalService']
				},
				shareImage: { type: 'image', label: 'Default share image' }
			}
		},
		locales: {
			label: 'Languages',
			fields: {
				es: { type: 'boolean', label: 'Spanish (es) enabled' }
			}
		}
	}
});
