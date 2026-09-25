/**
 * The one piece of plumbing every display component shares: find the scope,
 * read the value, decide whether it is editable, write it back.
 *
 * Scope resolution (`scope` prop):
 * - absent → the enclosing route scope from context, installed by the plugin
 *   into every `+layout.svelte` / `+page.svelte`.
 * - `'root'` → the root layout scope `layout:/`, so a page can read and write
 *   a value that lives site-wide (hours, contact, navigation, branding). The
 *   payload already carries every enclosing layout tree, and the root layout
 *   encloses everything.
 * - any other string → that scope id verbatim (`layout:/(public)`), for a
 *   value owned by an intermediate layout. Only param-less scopes can be
 *   addressed this way.
 *
 * Read rule (see `core/structured.ts`): `undefined` means nothing is stored
 * and the component shows its fallback; `null` means the editor cleared the
 * field, and the component shows it empty. Never conflate the two — that is
 * the bug where a cleared field reverts to the template's demo copy.
 */
import { getCmsScope, type CmsScope } from './scope.js';
import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

export const ROOT_SCOPE_ID = 'layout:/';

export type CmsFieldInput = {
	name: string;
	scope?: string;
	/** Per-item override: disables editing and scope lookup. */
	value?: unknown;
};

export const resolveScopeRef = (
	scope: string | undefined,
	context: CmsScope | undefined
): CmsScopeRef | null => {
	if (scope === 'root') return { scopeId: ROOT_SCOPE_ID, routeId: '/', params: {} };
	if (scope) {
		const colon = scope.indexOf(':');
		const routeId = colon === -1 ? scope : scope.slice(colon + 1);
		return { scopeId: colon === -1 ? `layout:${scope}` : scope, routeId, params: {} };
	}
	if (!context) return null;
	return { scopeId: context.scopeId, routeId: context.routeId, params: context.params };
};

export type CmsField<T> = {
	/** Resolved scope, or `null` outside any route scope. */
	readonly ref: CmsScopeRef | null;
	/** Raw stored value: `undefined` (nothing), `null` (cleared) or the value. */
	readonly raw: unknown;
	/** What to render, per the component's `read`. */
	readonly current: T;
	readonly editable: boolean;
	readonly name: string;
	/** Write the whole value into the draft. Pass `null` to clear. `locale`
	 * defaults to the locale being edited; structured editors pass the
	 * default locale for structure and another locale for its `$t` strings. */
	set: (next: unknown, locale?: string) => void;
	/** Write a value at a sub-path of this field, e.g. a `$t` string. */
	setAt: (subPath: string, next: unknown, locale?: string) => void;
	/** Read this field (or a sub-path of it) in a specific locale. */
	getIn: (locale: string, subPath?: string) => unknown;
	clear: () => void;
};

/**
 * Call once at component init. `input` is an accessor so prop changes flow
 * through; `read` turns the raw stored value into what the component renders.
 */
export const useCmsField = <T>(
	input: () => CmsFieldInput,
	read: (raw: unknown) => T
): CmsField<T> => {
	const context = getCmsScope();
	const ref = $derived(resolveScopeRef(input().scope, context));
	const raw = $derived.by(() => {
		const { name, value } = input();
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});
	const current = $derived(read(raw));
	const editable = $derived(cmsStore.isEditing && input().value === undefined && !!ref);
	const set = (next: unknown, locale?: string) => {
		if (ref) cmsStore.setValue(ref, input().name, next, locale);
	};
	const setAt = (subPath: string, next: unknown, locale?: string) => {
		if (ref) cmsStore.setValue(ref, `${input().name}.${subPath}`, next, locale);
	};
	const getIn = (locale: string, subPath?: string) =>
		ref
			? cmsStore.getValue(ref, subPath ? `${input().name}.${subPath}` : input().name, locale)
			: undefined;
	return {
		get ref() {
			return ref;
		},
		get raw() {
			return raw;
		},
		get current() {
			return current;
		},
		get editable() {
			return editable;
		},
		get name() {
			return input().name;
		},
		set,
		setAt,
		getIn,
		clear: () => set(null)
	};
};
