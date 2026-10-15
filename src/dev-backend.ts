/**
 * The CMS backend `npm run dev` serves at `/cms`, so the harness can be edited
 * without an account on the hosted one. Data lives in `./data` (gitignored)
 * and starts as `demoSeed`; delete `./data` to reset. Only the dev-only routes
 * import this.
 */
import { createCmsBackend } from '#lib/backend/index.js';
import { demoSeed } from './demo-seed.js';

export const DEV_EDITOR = { email: 'demo@example.com', password: 'demo' };

export const backend = createCmsBackend();

if (backend.editors.list().length === 0) {
	await backend.editors.create({ ...DEV_EDITOR, name: 'Demo', projects: ['default'] });
}

// A no-op once the project has published content, so edits are never overwritten.
backend.store.seed('default', demoSeed);
