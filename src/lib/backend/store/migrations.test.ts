import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations/index.js';
import { runMigrations } from './migrate.js';
import { loadDriver, type SqliteDb } from './sqlite.js';

const open = (): SqliteDb => new (loadDriver())(':memory:');

const applied = (db: SqliteDb): string[] =>
	db
		.prepare<[], { name: string }>('SELECT name FROM _migrations ORDER BY id')
		.all()
		.map((r) => r.name);

const tables = (db: SqliteDb): string[] =>
	db
		.prepare<[], { name: string }>(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
		)
		.all()
		.map((r) => r.name);

describe('migration names', () => {
	it('match the strings already recorded in deployed databases', () => {
		// These are the primary key of `_migrations` in production. If one of
		// them changes, the runner stops recognising it as applied and re-runs
		// CREATE TABLE against live data on the next boot. Deliberately dumb,
		// deliberately load-bearing.
		expect(MIGRATIONS.map((m) => m.name)).toEqual([
			'0001_init.sql',
			'0002_site.sql',
			'0003_editors.sql',
			'0004_release_publisher.sql'
		]);
	});
});

describe('runMigrations', () => {
	it('builds the full schema from empty', () => {
		const db = open();
		runMigrations(db, MIGRATIONS);
		expect(applied(db)).toEqual([
			'0001_init.sql',
			'0002_site.sql',
			'0003_editors.sql',
			'0004_release_publisher.sql'
		]);
		expect(tables(db)).toEqual([
			'_migrations',
			'cms_editors',
			'cms_project_editors',
			'cms_sessions',
			'media_items',
			'open_release_items',
			'open_releases',
			'project_state',
			'published_layouts',
			'published_pages',
			'published_site',
			'release_items',
			'releases',
			'sqlite_sequence'
		]);
	});

	it('is idempotent', () => {
		const db = open();
		runMigrations(db, MIGRATIONS);
		runMigrations(db, MIGRATIONS);
		expect(applied(db)).toHaveLength(4);
	});

	it('upgrades a database already at 0002 without touching its data', () => {
		// This is the production shape: `data/cms.sqlite` sits at 0001 + 0002.
		const db = open();
		runMigrations(db, MIGRATIONS.slice(0, 2));
		db.prepare<[string]>('INSERT INTO project_state (project_id) VALUES (?)').run('p1');
		db.prepare<[string, string, string, string, string]>(
			`INSERT INTO published_layouts (project_id, locale, route_id, tree, updated_at, updated_by_release)
			 VALUES (?, ?, ?, ?, ?, 'r1')`
		).run('p1', 'en', '/', '{"header":{"title":"kept"}}', '2026-01-01T00:00:00.000Z');

		runMigrations(db, MIGRATIONS);

		expect(applied(db)).toEqual([
			'0001_init.sql',
			'0002_site.sql',
			'0003_editors.sql',
			'0004_release_publisher.sql'
		]);
		const row = db
			.prepare<[string], { tree: string }>(
				'SELECT tree FROM published_layouts WHERE project_id = ?'
			)
			.get('p1');
		expect(row?.tree).toBe('{"header":{"title":"kept"}}');
	});

	it('fills the publisher of existing releases from the editor directory', () => {
		const db = open();
		runMigrations(db, MIGRATIONS.slice(0, 3));
		db.prepare<[string, string, string, string, string, string]>(
			`INSERT INTO cms_editors (id, email, email_lower, name, password_hash, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		).run('u1', 'Ann@example.com', 'ann@example.com', 'Ann', 'x', '2026-01-01T00:00:00.000Z');
		const insert = db.prepare<[string, string, number, string, string]>(
			`INSERT INTO releases (id, project_id, seq, name, published_by, published_at, preview_key)
			 VALUES (?, ?, ?, NULL, ?, '2026-01-01T00:00:00.000Z', ?)`
		);
		insert.run('r1', 'p1', 1, 'u1', 'k1');
		insert.run('r2', 'p1', 2, 'gone', 'k2');

		runMigrations(db, MIGRATIONS);

		const rows = db
			.prepare<[], { id: string; email: string | null; name: string | null }>(
				'SELECT id, published_by_email AS email, published_by_name AS name FROM releases ORDER BY seq'
			)
			.all();
		expect(rows).toEqual([
			{ id: 'r1', email: 'Ann@example.com', name: 'Ann' },
			{ id: 'r2', email: null, name: null }
		]);
	});

	it('records nothing new when the database is already current', () => {
		const db = open();
		runMigrations(db, MIGRATIONS);
		const before = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM _migrations').get()?.c;
		runMigrations(db, MIGRATIONS);
		const after = db.prepare<[], { c: number }>('SELECT count(*) AS c FROM _migrations').get()?.c;
		expect(after).toBe(before);
	});
});
