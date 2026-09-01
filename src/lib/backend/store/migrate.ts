import type { SqliteDb } from './sqlite.js';
import type { Migration } from './migrations/index.js';

/**
 * Apply any unapplied migrations, in order, each in its own transaction, and
 * record it in `_migrations` so re-runs are no-ops.
 *
 * Safe to call from every worker at boot — SQLite's writer lock serialises the
 * work and later workers find the rows already present.
 */
export const runMigrations = (db: SqliteDb, migrations: Migration[]): void => {
	db.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			applied_at TEXT NOT NULL
		);
	`);

	const applied = new Set(
		db
			.prepare<[], { name: string }>('SELECT name FROM _migrations')
			.all()
			.map((r) => r.name)
	);

	const insert = db.prepare<[string, string]>(
		'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
	);

	for (const { name, sql } of migrations) {
		if (applied.has(name)) continue;
		const tx = db.transaction(() => {
			db.exec(sql);
			insert.run(name, new Date().toISOString());
		});
		tx();
	}
};
