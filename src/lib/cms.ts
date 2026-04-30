import { createCms, mockAdapter, apiAdapter } from '$lib/srv/index.js';

// Mock data
// import { layoutDocs, lookupReleaseByPreviewKey, pageDocs } from '../routes/api/cms/_store.js';

export const { load: loadCms, generateEntries } = createCms({
	// adapter: mockAdapter({
	// 	layoutDocs,
	// 	pageDocs,
	// 	resolvePreview: lookupReleaseByPreviewKey
	// }),
	adapter: apiAdapter({ endpoint: 'http://localhost:5174/v1/projects/project_id/cms' }),
	locale: 'en'
});
