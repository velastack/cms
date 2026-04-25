// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { CmsPayload } from '$lib/components/cms/scope.js';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			cms?: CmsPayload;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
