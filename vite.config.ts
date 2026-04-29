import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { cms } from './plugin/src/index.js';

const testManifestFixture = fileURLToPath(
	new URL('./src/routes/api/cms/__tests__/__fixtures__/test-manifest.ts', import.meta.url)
);

export default defineConfig({
	plugins: [tailwindcss(), cms(), sveltekit()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				resolve: {
					alias: {
						// In tests, `virtual:vela-cms/manifest` resolves to a stable
						// fixture rather than whatever the cms plugin would
						// produce from the live `src/routes` tree. Server tests target
						// `resolveCmsPayload` directly with their own manifest, but
						// `loadCms`, `createCms.load`, and `/api/cms/pages` import
						// from the virtual id — they get this fixture.
						'virtual:vela-cms/manifest': testManifestFixture
					}
				},
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'plugin/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
