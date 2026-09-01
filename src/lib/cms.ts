import { createCms, apiAdapter } from '$lib/server/index.js';
import { locales } from '$locales/data.js';

export const { load: loadCms, generateEntries } = createCms({
	adapter: apiAdapter({ endpoint: 'https://velastack.dev/v1/projects/velastack-cms/cms' }),
	locales,
	site: {
		branding: {
			label: 'Branding',
			fields: {
				name: { type: 'text', label: 'Business name' },
				tagline: { type: 'text', label: 'Tagline' },
				logo: { type: 'image', label: 'Logo' }
			}
		},
		contact: {
			label: 'Contact',
			fields: {
				email: { type: 'text', label: 'Email', placeholder: 'hello@example.com' },
				phone: { type: 'text', label: 'Phone' }
			}
		},
		social: {
			label: 'Social',
			fields: {
				twitter: { type: 'url', label: 'Twitter / X' },
				instagram: { type: 'url', label: 'Instagram' }
			}
		}
	}
});
