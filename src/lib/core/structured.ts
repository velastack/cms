/**
 * Structured values: the shapes behind the editor components (hours, team,
 * testimonials, …) and the two rules every one of them follows.
 *
 * 1. **Versioned shapes, whole-object writes.** A structured value is a plain
 *    object with a `v` version number. Components never patch a leaf inside
 *    it; they read the whole value through the schema's `normalize`, change
 *    it, and write the whole object back. A field the editor clears is
 *    written as `null`, never dropped: the draft and release trees deep-merge
 *    over the published tree, and a missing key merges to "unchanged" while
 *    `null` merges to "cleared". That is what stops a cleared field from
 *    reverting to the template's demo copy.
 *
 * 2. **Localisation is a string overlay, never a second structure.** The
 *    default locale stores the full value at `<name>`. Every other locale
 *    stores only strings, at `<name>.$t.<id>.<field>`, keyed by the stable
 *    `id` of the list item they translate (the reserved id `_` addresses the
 *    value's own root fields). Because objects deep-merge across locales,
 *    reading `es` yields the default structure plus the `es` overlay, and
 *    {@link applyTranslations} folds the strings in. Structure edits happen in
 *    the default locale only, so the item list can never fork between
 *    languages.
 */
import { get, leafPaths, type Tree } from './path.js';

/** Branch under a structured value that holds a locale's string overlay. */
export const TRANSLATIONS_KEY = '$t';

/** Overlay id that addresses the structured value's root fields. */
export const ROOT_ID = '_';

/** `{ [itemId]: { [field]: string } }` — what a non-default locale stores. */
export type TranslationOverlay = Record<string, Record<string, string>>;

export type StructuredItem = { id: string } & Record<string, unknown>;

/**
 * One list of items inside a structured value. `key` names the array field,
 * `translatable` the item fields holding translatable text (a string, or an
 * array of strings, translated per index as `<field>.<i>`), and `items` any
 * lists nested inside each item (a collection item's `details`, a pricing
 * tier's `features`). Every item at every level carries a stable `id`.
 */
export type ItemsSpec = {
	key: string;
	translatable: readonly string[];
	items?: ItemsSpec | readonly ItemsSpec[];
};

export type StructuredSchema<T extends Tree> = {
	/** Exported component name, e.g. `'CmsHours'`. Recorded in the manifest. */
	component: string;
	/** Current shape version, written as `v` on every value. */
	version: number;
	/** Root-level fields holding translatable strings, e.g. `['note']`. A
	 * dotted path addresses a nested field (`'labels.closed'`). */
	translatable: readonly string[];
	/** The value's item lists, when it has any, and the item fields that translate. */
	items?: ItemsSpec | readonly ItemsSpec[];
	/**
	 * Turn anything the store may hold — an older version, a hand-seeded
	 * partial object, garbage — into the current shape. Must never throw.
	 */
	normalize: (raw: unknown) => T;
	/** The cleared value: what an editor gets after "Clear". */
	empty: () => T;
};

export type Structured<T extends Tree> = StructuredSchema<T> & {
	/**
	 * Resolve a stored value the way a display component reads it:
	 * `undefined` (nothing stored) → the fallback; `null` (cleared) → empty;
	 * anything else → normalized, with the locale overlay applied.
	 */
	read: (raw: unknown, fallback: T | undefined) => T;
};

export const isPlainObject = (v: unknown): v is Tree =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

export const defineStructured = <T extends Tree>(schema: StructuredSchema<T>): Structured<T> => ({
	...schema,
	read: (raw, fallback) => {
		if (raw === undefined)
			return fallback === undefined ? schema.empty() : schema.normalize(fallback);
		if (raw === null) return schema.empty();
		const overlay = extractTranslations(raw);
		const value = schema.normalize(stripTranslations(raw));
		return overlay ? applyTranslations(value, overlay, schema) : value;
	}
});

/** Path of one translated string: `<name>.$t.<id>.<field>`. */
export const translationPath = (name: string, id: string, field: string): string =>
	`${name}.${TRANSLATIONS_KEY}.${id}.${field}`;

/** The `$t` branch of a stored value, when it is one. A dotted field
 * (`labels.closed`, `tags.0`) is stored nested by the path-based writes and
 * read back flat here. */
export const extractTranslations = (raw: unknown): TranslationOverlay | undefined => {
	if (!isPlainObject(raw)) return undefined;
	const t = raw[TRANSLATIONS_KEY];
	if (!isPlainObject(t)) return undefined;
	const out: TranslationOverlay = {};
	for (const [id, fields] of Object.entries(t)) {
		if (!isPlainObject(fields)) continue;
		const strings: Record<string, string> = {};
		for (const path of leafPaths(fields)) {
			const v = get(fields, path);
			if (typeof v === 'string') strings[path] = v;
		}
		out[id] = strings;
	}
	return out;
};

/** A copy of `raw` without its `$t` branch, so a whole-object write in the
 * default locale never carries another locale's strings. */
export const stripTranslations = (raw: unknown): unknown => {
	if (!isPlainObject(raw) || !(TRANSLATIONS_KEY in raw)) return raw;
	const { [TRANSLATIONS_KEY]: _omit, ...rest } = raw;
	return rest;
};

const overlayString = (
	overlay: TranslationOverlay,
	id: string,
	field: string
): string | undefined => {
	const v = overlay[id]?.[field];
	return typeof v === 'string' && v !== '' ? v : undefined;
};

const specList = (items: ItemsSpec | readonly ItemsSpec[] | undefined): readonly ItemsSpec[] =>
	items === undefined ? [] : Array.isArray(items) ? items : [items as ItemsSpec];

const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((s) => typeof s === 'string');

/** `set` that copies along the path instead of mutating shared branches. */
export const setIn = (obj: Tree, path: string, value: unknown): Tree => {
	const [head, ...rest] = path.split('.');
	const out = { ...obj };
	if (rest.length === 0) {
		out[head] = value;
		return out;
	}
	const child = obj[head];
	out[head] = setIn(isPlainObject(child) ? child : {}, rest.join('.'), value);
	return out;
};

/**
 * Fold a locale's string overlay into one object (the root value or an item)
 * and, recursively, into the item lists it holds.
 */
const applyTo = (
	obj: Tree,
	id: string,
	translatable: readonly string[],
	items: ItemsSpec | readonly ItemsSpec[] | undefined,
	overlay: TranslationOverlay
): Tree => {
	let out: Tree = { ...obj };
	for (const field of translatable) {
		const cur = get(obj, field);
		if (typeof cur === 'string') {
			const s = overlayString(overlay, id, field);
			if (s !== undefined) out = setIn(out, field, s);
		} else if (isStringArray(cur)) {
			let changed = false;
			const next = cur.map((v, i) => {
				const s = overlayString(overlay, id, `${field}.${i}`);
				if (s === undefined) return v;
				changed = true;
				return s;
			});
			if (changed) out = setIn(out, field, next);
		}
	}
	for (const spec of specList(items)) {
		const list = obj[spec.key];
		if (!Array.isArray(list)) continue;
		out[spec.key] = list.map((item) =>
			isPlainObject(item) && typeof item.id === 'string'
				? applyTo(item, item.id, spec.translatable, spec.items, overlay)
				: item
		);
	}
	return out;
};

/**
 * Fold a locale's string overlay into a normalized default-locale value.
 * Root fields come from the `_` id; item fields from the item's own `id`,
 * at every nesting level. Only non-empty strings override, so an
 * untranslated field shows the default-locale text rather than a blank.
 */
export const applyTranslations = <T extends Tree>(
	value: T,
	overlay: TranslationOverlay | undefined,
	schema: Pick<StructuredSchema<T>, 'translatable' | 'items'>
): T => {
	if (!overlay) return value;
	return applyTo(value, ROOT_ID, schema.translatable, schema.items, overlay) as T;
};

export type TranslatableField = {
	/** Overlay id: an item id, or `_` for a root field. */
	id: string;
	/** Field path within the object the id addresses (`note`, `labels.closed`, `tags.0`). */
	field: string;
	/** The default-locale string being translated. */
	source: string;
};

const collectFrom = (
	obj: Tree,
	id: string,
	translatable: readonly string[],
	items: ItemsSpec | readonly ItemsSpec[] | undefined,
	out: TranslatableField[]
): void => {
	for (const field of translatable) {
		const cur = get(obj, field);
		if (typeof cur === 'string') {
			if (cur !== '') out.push({ id, field, source: cur });
		} else if (isStringArray(cur)) {
			cur.forEach((s, i) => {
				if (s !== '') out.push({ id, field: `${field}.${i}`, source: s });
			});
		}
	}
	for (const spec of specList(items)) {
		const list = obj[spec.key];
		if (!Array.isArray(list)) continue;
		for (const item of list) {
			if (!isPlainObject(item) || typeof item.id !== 'string') continue;
			collectFrom(item, item.id, spec.translatable, spec.items, out);
		}
	}
};

/**
 * Every translatable, non-empty string in a normalized default-locale value.
 * Drives the popover's translation tab and the Locales panel's counts.
 */
export const translatableFields = <T extends Tree>(
	value: T,
	schema: Pick<StructuredSchema<T>, 'translatable' | 'items'>
): TranslatableField[] => {
	const out: TranslatableField[] = [];
	collectFrom(value, ROOT_ID, schema.translatable, schema.items, out);
	return out;
};

/** How many translatable strings a locale's overlay still lacks. */
export const countTranslations = <T extends Tree>(
	value: T,
	overlay: TranslationOverlay | undefined,
	schema: Pick<StructuredSchema<T>, 'translatable' | 'items'>
): { total: number; missing: number } => {
	const fields = translatableFields(value, schema);
	let missing = 0;
	for (const f of fields) {
		if (!overlay || overlayString(overlay, f.id, f.field) === undefined) missing += 1;
	}
	return { total: fields.length, missing };
};

// ---------------------------------------------------------------------------
// Normalizer building blocks
// ---------------------------------------------------------------------------

export const asString = (v: unknown, fallback = ''): string =>
	typeof v === 'string' ? v : fallback;

export const asNumber = (v: unknown, fallback: number | null = null): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export const asBoolean = (v: unknown, fallback = false): boolean =>
	typeof v === 'boolean' ? v : fallback;

/**
 * Normalize a list of items, guaranteeing every item carries a string `id`.
 * An item without one (a hand-written seed, say) gets a deterministic
 * `item-<index>` so reads stay stable until the editor next writes the list,
 * at which point the ids are persisted.
 */
export const asItems = <I extends StructuredItem>(
	raw: unknown,
	normalizeItem: (item: Tree, index: number) => Omit<I, 'id'>
): I[] => {
	if (!Array.isArray(raw)) return [];
	const out: I[] = [];
	raw.forEach((entry, index) => {
		if (!isPlainObject(entry)) return;
		const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : `item-${index}`;
		out.push({ id, ...normalizeItem(entry, index) } as I);
	});
	return out;
};

/** A short random id for a newly added item. Stable once written. */
export const newItemId = (): string => {
	const bytes = new Uint8Array(6);
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
	else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	let out = '';
	for (const b of bytes) out += b.toString(16).padStart(2, '0');
	return out;
};

/** Read a structured value's overlay for one locale out of a whole scope tree. */
export const overlayAt = (tree: Tree | undefined, name: string): TranslationOverlay | undefined =>
	extractTranslations(get(tree, name));

/** A list of strings; anything else is dropped. */
export const asStrings = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

/** A nullable string: `null` (cleared) stays `null`; anything else is a string. */
export const asOptionalString = (v: unknown): string | null =>
	typeof v === 'string' && v !== '' ? v : null;

/** One of a fixed set of strings, else the fallback. */
export const asEnum = <E extends string>(v: unknown, values: readonly E[], fallback: E): E =>
	typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as E) : fallback;

/** Move an item within a list, returning a new list. */
export const moveItem = <I>(list: readonly I[], from: number, to: number): I[] => {
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
};
