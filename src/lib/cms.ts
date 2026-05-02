import { createCms, apiAdapter } from '$lib/srv/index.js';
import { locales } from '$locales/data.js';

export const { load: loadCms, generateEntries } = createCms({
	adapter: apiAdapter({ endpoint: 'http://localhost:5174/v1/projects/project_id/cms' }),
	locales
});
