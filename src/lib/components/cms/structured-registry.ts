/**
 * Which exported component reads which structured shape. Structured
 * components register their schema at module load, so the Locales panel can
 * count translatable strings for every usage the manifest recorded on the
 * current route without importing the components themselves.
 */
import type { Structured } from '../../core/structured.js';
import type { Tree } from '../../core/path.js';

const registry = new Map<string, Structured<Tree>>();

export const registerStructured = <T extends Tree>(schema: Structured<T>): Structured<T> => {
	registry.set(schema.component, schema as unknown as Structured<Tree>);
	return schema;
};

export const getStructured = (component: string): Structured<Tree> | undefined =>
	registry.get(component);
