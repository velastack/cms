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
			'0003_editors.sql'
		]);
	});
});

describe('runMigrations', () => {
	it('builds the full schema from empty', () => {
		const db = open();
		runMigrations(db, MIGRATIONS);
		expect(applied(db)).toEqual(['0001_init.sql', '0002_site.sql', '0003_editors.sql']);
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
		expect(applied(db)).toHaveLength(3);
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

		expect(applied(db)).toEqual(['0001_init.sql', '0002_site.sql', '0003_editors.sql']);
		const row = db
			.prepare<[string], { tree: string }>(
				'SELECT tree FROM published_layouts WHERE project_id = ?'
			)
			.get('p1');
		expect(row?.tree).toBe('{"header":{"title":"kept"}}');
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
