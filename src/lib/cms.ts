import { createCms, mockAdapter } from './server/index.js';

// Mock data
import { layoutDocs, lookupReleaseByPreviewKey, pageDocs } from '../routes/api/cms/_store.js';

export const { load: loadCms, generateEntries } = createCms({
	adapter: mockAdapter({
		layoutDocs,
		pageDocs,
		resolvePreview: lookupReleaseByPreviewKey
	}),
	locale: 'en'
});
