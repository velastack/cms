import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadDriver, type SqliteDb } from './sqlite.js';
import { runMigrations } from './migrate.js';
import { MIGRATIONS } from './migrations/index.js';

/**
 * Open the CMS database and bring its schema up to date.
 *
 * Unlike the version this was lifted from, there is no module-level singleton
 * and no `CMS_DB_PATH` lookup: the path is supplied by the host, which is what
 * lets one process host two backends and lets each test file hold its own
 * `':memory:'` database.
 */
export const openDatabase = (dbPath: string): SqliteDb => {
	const Driver = loadDriver();
	if (dbPath !== ':memory:') {
		mkdirSync(dirname(dbPath), { recursive: true });
	}
	const db = new Driver(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('cache_size = -65536');
	db.pragma('mmap_size = 268435456');
	db.pragma('foreign_keys = ON');
	db.pragma('temp_store = MEMORY');
	db.pragma('busy_timeout = 5000');
	runMigrations(db, MIGRATIONS);
	return db;
};
