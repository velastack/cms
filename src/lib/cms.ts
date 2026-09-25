import { createCms, apiAdapter } from '$lib/server/index.js';
import { locales } from '$locales/data.js';

export const { load: loadCms, generateEntries } = createCms({
	adapter: apiAdapter({ endpoint: 'https://velastack.dev/v1/projects/velastack-cms/cms' }),
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
