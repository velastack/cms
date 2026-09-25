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
import { get, type Tree } from './path.js';

/** Branch under a structured value that holds a locale's string overlay. */
export const TRANSLATIONS_KEY = '$t';

/** Overlay id that addresses the structured value's root fields. */
export const ROOT_ID = '_';

/** `{ [itemId]: { [field]: string } }` — what a non-default locale stores. */
export type TranslationOverlay = Record<string, Record<string, string>>;

export type StructuredItem = { id: string } & Record<string, unknown>;

export type StructuredSchema<T extends Tree> = {
	/** Exported component name, e.g. `'CmsHours'`. Recorded in the manifest. */
	component: string;
	/** Current shape version, written as `v` on every value. */
	version: number;
	/** Root-level fields holding translatable strings, e.g. `['note']`. */
	translatable: readonly string[];
	/** The item list, when the value has one, and the item fields that translate. */
	items?: { key: string; translatable: readonly string[] };
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
		if (raw === undefined) return fallback === undefined ? schema.empty() : fallback;
		if (raw === null) return schema.empty();
		const overlay = extractTranslations(raw);
		const value = schema.normalize(stripTranslations(raw));
		return overlay ? applyTranslations(value, overlay, schema) : value;
	}
});

/** Path of one translated string: `<name>.$t.<id>.<field>`. */
export const translationPath = (name: string, id: string, field: string): string =>
	`${name}.${TRANSLATIONS_KEY}.${id}.${field}`;

/** The `$t` branch of a stored value, when it is one. */
export const extractTranslations = (raw: unknown): TranslationOverlay | undefined => {
	if (!isPlainObject(raw)) return undefined;
	const t = raw[TRANSLATIONS_KEY];
	if (!isPlainObject(t)) return undefined;
	const out: TranslationOverlay = {};
	for (const [id, fields] of Object.entries(t)) {
		if (!isPlainObject(fields)) continue;
		const strings: Record<string, string> = {};
		for (const [field, v] of Object.entries(fields)) {
			if (typeof v === 'string') strings[field] = v;
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

/**
 * Fold a locale's string overlay into a normalized default-locale value.
 * Root fields come from the `_` id; item fields from the item's own `id`.
 * Only non-empty strings override, so an untranslated field shows the
 * default-locale text rather than a blank.
 */
export const applyTranslations = <T extends Tree>(
	value: T,
	overlay: TranslationOverlay | undefined,
	schema: Pick<StructuredSchema<T>, 'translatable' | 'items'>
): T => {
	if (!overlay) return value;
	const out: Tree = { ...value };
	for (const field of schema.translatable) {
		const s = overlayString(overlay, ROOT_ID, field);
		if (s !== undefined) out[field] = s;
	}
	if (schema.items) {
		const list = value[schema.items.key];
		if (Array.isArray(list)) {
			out[schema.items.key] = list.map((item) => {
				if (!isPlainObject(item) || typeof item.id !== 'string') return item;
				const next: Tree = { ...item };
				for (const field of schema.items!.translatable) {
					const s = overlayString(overlay, item.id, field);
					if (s !== undefined) next[field] = s;
				}
				return next;
			});
		}
	}
	return out as T;
};

export type TranslatableField = {
	/** Overlay id: an item id, or `_` for a root field. */
	id: string;
	field: string;
	/** The default-locale string being translated. */
	source: string;
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
	for (const field of schema.translatable) {
		const s = value[field];
		if (typeof s === 'string' && s !== '') out.push({ id: ROOT_ID, field, source: s });
	}
	if (schema.items) {
		const list = value[schema.items.key];
		if (Array.isArray(list)) {
			for (const item of list) {
				if (!isPlainObject(item) || typeof item.id !== 'string') continue;
				for (const field of schema.items.translatable) {
					const s = item[field];
					if (typeof s === 'string' && s !== '') out.push({ id: item.id, field, source: s });
				}
			}
		}
	}
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
