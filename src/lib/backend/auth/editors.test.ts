import { beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore, type CmsEditorStore } from './editors.js';
import { runMigrations } from '../store/migrate.js';
import { MIGRATIONS } from '../store/migrations/index.js';
import { loadDriver, type SqliteDb } from '../store/sqlite.js';

const FAST = { N: 1024, r: 8, p: 1 };

let db: SqliteDb;
let editors: CmsEditorStore;

beforeEach(() => {
	db = new (loadDriver())(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db, MIGRATIONS);
	editors = createEditorStore(db, FAST);
});

const alice = () =>
	editors.create({ email: 'alice@example.com', password: 'password', name: 'Alice' });

describe('accounts', () => {
	it('creates and finds by id or email', async () => {
		const user = await alice();
		expect(user.email).toBe('alice@example.com');
		expect(editors.find(user.id)?.id).toBe(user.id);
		expect(editors.find('alice@example.com')?.id).toBe(user.id);
		expect(editors.find('ALICE@example.com')?.id).toBe(user.id);
	});

	it('defaults the name to the email', async () => {
		const user = await editors.create({ email: 'noname@example.com', password: 'pw' });
		expect(user.name).toBe('noname@example.com');
	});

	it('rejects a duplicate email regardless of case', async () => {
		await alice();
		await expect(editors.create({ email: 'ALICE@example.com', password: 'other' })).rejects.toThrow(
			/already exists/
		);
	});

	it('rejects an obviously invalid email and an empty password', async () => {
		await expect(editors.create({ email: 'nope', password: 'pw' })).rejects.toThrow(
			/invalid email/
		);
		await expect(editors.create({ email: 'a@example.com', password: '' })).rejects.toThrow(
			/password required/
		);
	});

	it('never stores the password', async () => {
		await alice();
		const row = db
			.prepare<[], { password_hash: string }>('SELECT password_hash FROM cms_editors')
			.get();
		expect(row?.password_hash).not.toContain('password');
		expect(row?.password_hash.startsWith('scrypt$')).toBe(true);
	});
});

describe('verify', () => {
	it('accepts correct credentials', async () => {
		const user = await alice();
		await expect(editors.verify('alice@example.com', 'password')).resolves.toMatchObject({
			id: user.id
		});
	});

	it('is case-insensitive on the email', async () => {
		await alice();
		await expect(editors.verify('Alice@Example.com', 'password')).resolves.not.toBeNull();
	});

	it('returns null for a wrong password and for an unknown account alike', async () => {
		await alice();
		await expect(editors.verify('alice@example.com', 'wrong')).resolves.toBeNull();
		await expect(editors.verify('nobody@example.com', 'password')).resolves.toBeNull();
	});

	it('refuses a disabled account', async () => {
		const user = await alice();
		editors.setDisabled(user.id, true);
		await expect(editors.verify('alice@example.com', 'password')).resolves.toBeNull();
	});
});

describe('project grants', () => {
	it('gates access per project', async () => {
		const a = await alice();
		editors.grant(a.id, 'p1');
		expect(editors.can(a.id, 'p1')).toBe(true);
		expect(editors.can(a.id, 'p2')).toBe(false);
	});

	it('grants at creation time', async () => {
		const a = await editors.create({
			email: 'multi@example.com',
			password: 'pw',
			projects: ['p1', 'p2']
		});
		expect(editors.projectsFor(a.id)).toEqual(['p1', 'p2']);
	});

	it('is idempotent and revocable', async () => {
		const a = await alice();
		editors.grant(a.id, 'p1');
		editors.grant(a.id, 'p1');
		expect(editors.projectsFor(a.id)).toEqual(['p1']);
		expect(editors.revoke(a.id, 'p1')).toBe(true);
		expect(editors.can(a.id, 'p1')).toBe(false);
		expect(editors.revoke(a.id, 'p1')).toBe(false);
	});

	it("lists a project's editors", async () => {
		const a = await alice();
		const b = await editors.create({ email: 'bob@example.com', password: 'pw', projects: ['p1'] });
		editors.grant(a.id, 'p1');
		expect(
			editors
				.listForProject('p1')
				.map((e) => e.id)
				.sort()
		).toEqual([a.id, b.id].sort());
	});

	it('cascades grants when an editor is deleted', async () => {
		const a = await alice();
		editors.grant(a.id, 'p1');
		expect(editors.delete(a.id)).toBe(true);
		expect(editors.can(a.id, 'p1')).toBe(false);
	});
});

describe('sessions', () => {
	it('round-trips a token to its editor', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id);
		expect(editors.resolveSession(token)?.id).toBe(a.id);
	});

	it('stores only the digest, never the token', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id);
		const row = db.prepare<[], { token_hash: string }>('SELECT token_hash FROM cms_sessions').get();
		expect(row?.token_hash).not.toBe(token);
		expect(row?.token_hash).toHaveLength(64);
	});

	it('rejects unknown and empty tokens', async () => {
		await alice();
		expect(editors.resolveSession('nope')).toBeNull();
		expect(editors.resolveSession('')).toBeNull();
	});

	it('rejects an expired session', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id, { ttlMs: -1000 });
		expect(editors.resolveSession(token)).toBeNull();
	});

	it('rejects a session for a disabled account', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id);
		editors.setDisabled(a.id, true);
		expect(editors.resolveSession(token)).toBeNull();
	});

	it('destroys one session without touching the others', async () => {
		const a = await alice();
		const one = editors.createSession(a.id);
		const two = editors.createSession(a.id);
		editors.destroySession(one.token);
		expect(editors.resolveSession(one.token)).toBeNull();
		expect(editors.resolveSession(two.token)?.id).toBe(a.id);
	});

	it('ends every session when the password changes', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id);
		await editors.setPassword(a.id, 'new-password');
		expect(editors.resolveSession(token)).toBeNull();
		await expect(editors.verify('alice@example.com', 'new-password')).resolves.not.toBeNull();
	});

	it('cascades sessions when an editor is deleted', async () => {
		const a = await alice();
		const { token } = editors.createSession(a.id);
		editors.delete(a.id);
		expect(editors.resolveSession(token)).toBeNull();
	});

	it('purges expired sessions', async () => {
		const a = await alice();
		editors.createSession(a.id, { ttlMs: -1000 });
		editors.createSession(a.id);
		expect(editors.purgeExpiredSessions()).toBe(1);
	});
});
