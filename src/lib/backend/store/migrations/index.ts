import { sql as init } from './0001-init.js';
import { sql as site } from './0002-site.js';
import { sql as editors } from './0003-editors.js';

export type Migration = { name: string; sql: string };

/**
 * Every migration, in apply order.
 *
 * ⚠ The `name` values are the primary key of the `_migrations` table on every
 * database already in production. `0001_init.sql` and `0002_site.sql` are the
 * exact strings recorded there — including the `.sql` suffix these are no
 * longer stored in. Rename one and the runner stops recognising it as applied,
 * re-runs `CREATE TABLE published_pages` against live data, and the app fails
 * to boot. `migrations.test.ts` pins these strings for that reason.
 */
export const MIGRATIONS: Migration[] = [
	{ name: '0001_init.sql', sql: init },
	{ name: '0002_site.sql', sql: site },
	{ name: '0003_editors.sql', sql: editors }
];
