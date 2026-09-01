/**
 * A structural view of the slice of `better-sqlite3` this backend uses.
 *
 * Declaring the shape here rather than importing `@types/better-sqlite3` has
 * three payoffs. The driver stays out of the emitted `dist/backend/*.d.ts`, so
 * a consumer type-checking against `@velastack/cms/backend` needs neither the
 * package nor its types. `createRequire` is opaque to bundlers, which is what a
 * native `.node` binding needs anyway. And a host can hand in an already-open
 * connection through `db`, which is also how tests get an isolated `:memory:`
 * database per file.
 *
 * The generic `prepare<Params, Row>` signature matches how the store already
 * calls it, so the call sites are unchanged from the original.
 */
import { createRequire } from 'node:module';

export interface SqliteStatement<Params extends unknown[] = unknown[], Row = unknown> {
	run(...params: Params): { changes: number; lastInsertRowid: number | bigint };
	get(...params: Params): Row | undefined;
	all(...params: Params): Row[];
}

export interface SqliteDb {
	prepare<Params extends unknown[] = unknown[], Row = unknown>(
		sql: string
	): SqliteStatement<Params, Row>;
	exec(sql: string): void;
	transaction<Fn extends (...args: never[]) => unknown>(fn: Fn): Fn;
	pragma(source: string): unknown;
	close(): void;
}

export type SqliteDriver = new (path: string) => SqliteDb;

/**
 * Resolve `better-sqlite3` at call time. It is an optional peer dependency, so
 * a project that only uses the components and the SSR read path never installs
 * it — and never compiles a native module.
 */
export const loadDriver = (): SqliteDriver => {
	try {
		return createRequire(import.meta.url)('better-sqlite3') as SqliteDriver;
	} catch (cause) {
		throw new Error(
			"@velastack/cms/backend requires 'better-sqlite3', which is an optional peer " +
				'dependency. Install it with `npm i better-sqlite3`.',
			{ cause }
		);
	}
};
