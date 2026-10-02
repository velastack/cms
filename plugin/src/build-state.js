/**
 * Module-level singleton bridging the @velastack/cms Vite plugin and the
 * @velastack/cms-static adapter. The plugin populates this during its build
 * (`load` of `virtual:vela-cms/pages` ⇒ `setPageCmsModules`); the adapter
 * reads it from `adapt()` to know which routes are creatable without
 * re-walking `src/routes/` itself.
 *
 * Backed by `globalThis` because Vite's plugin context and SvelteKit's
 * adapter context resolve `./build-state.js` through separate module
 * caches in the same Node process — ESM-style module-scoped `let` would
 * leave the adapter looking at a fresh, empty instance. `globalThis` is
 * the one shared place both sides agree on.
 *
 * @typedef {{ routeId: string; path: string; creatable: boolean }} PageCmsModule
 */

const KEY = Symbol.for('@velastack/cms.buildState');

/** @type {{ pageCmsModules: PageCmsModule[]; reported?: boolean }} */
// @ts-ignore
const store = /** @type {any} */ (globalThis[KEY] ??= { pageCmsModules: [] });

/** @param {PageCmsModule[]} modules */
export const setPageCmsModules = (modules) => {
	store.pageCmsModules = modules;
	store.reported = true;
};

/** @returns {PageCmsModule[]} */
export const getPageCmsModules = () => store.pageCmsModules;

/**
 * Whether the plugin has reported its route walk in this process at all —
 * `false` means the adapter is running without the `cms()` Vite plugin (or
 * the two no longer share a process), not that there are no page.cms files.
 *
 * @returns {boolean}
 */
export const pageCmsModulesReported = () => store.reported === true;
