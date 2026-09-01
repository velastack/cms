/**
 * The CMS's own editor directory: accounts, per-project grants, and sessions.
 *
 * Bound to one database, like the content store. Everything here is
 * synchronous except the two password paths, which go through scrypt.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqliteDb } from '../store/sqlite.js';
import type { CmsEditor } from '../types.js';
import { hashPassword, verifyPassword, type ScryptParams } from './scrypt.js';

export type EditorRow = {
	id: string;
	email: string;
	name: string;
	password_hash: string;
	created_at: string;
	disabled_at: string | null;
};

export type CreateEditorInput = {
	email: string;
	password: string;
	name?: string;
	/** Projects to grant immediately. Equivalent to `grant()` per id. */
	projects?: string[];
};

const nowIso = (): string => new Date().toISOString();

/** Sessions are keyed by digest, never by the token itself, so the table is
 * useless to anyone who reads it. */
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

const toEditor = (row: EditorRow): CmsEditor => ({
	id: row.id,
	email: row.email,
	name: row.name
});

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const createEditorStore = (db: SqliteDb, scryptParams?: ScryptParams) => {
	const insertEditor = db.prepare<[string, string, string, string, string, string]>(
		`INSERT INTO cms_editors (id, email, email_lower, name, password_hash, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`
	);
	const byEmail = db.prepare<[string], EditorRow>(
		'SELECT id, email, name, password_hash, created_at, disabled_at FROM cms_editors WHERE email_lower = ?'
	);
	const byId = db.prepare<[string], EditorRow>(
		'SELECT id, email, name, password_hash, created_at, disabled_at FROM cms_editors WHERE id = ?'
	);
	const listAll = db.prepare<[], EditorRow>(
		'SELECT id, email, name, password_hash, created_at, disabled_at FROM cms_editors ORDER BY created_at, id'
	);
	const updateHash = db.prepare<[string, string]>(
		'UPDATE cms_editors SET password_hash = ? WHERE id = ?'
	);
	const removeEditor = db.prepare<[string]>('DELETE FROM cms_editors WHERE id = ?');
	const setDisabled = db.prepare<[string | null, string]>(
		'UPDATE cms_editors SET disabled_at = ? WHERE id = ?'
	);

	const insertGrant = db.prepare<[string, string, string, string]>(
		`INSERT INTO cms_project_editors (project_id, editor_id, role, granted_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT (project_id, editor_id) DO NOTHING`
	);
	const removeGrant = db.prepare<[string, string]>(
		'DELETE FROM cms_project_editors WHERE project_id = ? AND editor_id = ?'
	);
	const hasGrant = db.prepare<[string, string], { one: number }>(
		'SELECT 1 AS one FROM cms_project_editors WHERE project_id = ? AND editor_id = ?'
	);
	const grantsFor = db.prepare<[string], { project_id: string }>(
		'SELECT project_id FROM cms_project_editors WHERE editor_id = ? ORDER BY project_id'
	);
	const editorsFor = db.prepare<[string], EditorRow>(
		`SELECT e.id, e.email, e.name, e.password_hash, e.created_at, e.disabled_at
		 FROM cms_editors e
		 JOIN cms_project_editors pe ON pe.editor_id = e.id
		 WHERE pe.project_id = ?
		 ORDER BY e.created_at, e.id`
	);

	const insertSession = db.prepare<[string, string, string, string]>(
		'INSERT INTO cms_sessions (token_hash, editor_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
	);
	const sessionEditor = db.prepare<[string, string], EditorRow>(
		`SELECT e.id, e.email, e.name, e.password_hash, e.created_at, e.disabled_at
		 FROM cms_sessions s
		 JOIN cms_editors e ON e.id = s.editor_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`
	);
	const removeSession = db.prepare<[string]>('DELETE FROM cms_sessions WHERE token_hash = ?');
	const removeEditorSessions = db.prepare<[string]>('DELETE FROM cms_sessions WHERE editor_id = ?');
	const removeExpired = db.prepare<[string]>('DELETE FROM cms_sessions WHERE expires_at <= ?');

	const find = (idOrEmail: string): EditorRow | undefined =>
		byId.get(idOrEmail) ?? byEmail.get(idOrEmail.toLowerCase());

	return {
		/** Create an account. Throws on a duplicate email (the unique index on
		 * `email_lower` is the arbiter, so case doesn't let one through). */
		async create(input: CreateEditorInput): Promise<CmsEditor> {
			const email = input.email.trim();
			if (!email.includes('@')) throw new Error(`invalid email: ${input.email}`);
			if (input.password.length === 0) throw new Error('password required');
			if (byEmail.get(email.toLowerCase())) {
				throw new Error(`an editor with the email ${email} already exists`);
			}
			const id = randomUUID();
			const hash = await hashPassword(input.password, scryptParams);
			insertEditor.run(id, email, email.toLowerCase(), input.name ?? email, hash, nowIso());
			for (const projectId of input.projects ?? []) {
				insertGrant.run(projectId, id, 'editor', nowIso());
			}
			return { id, email, name: input.name ?? email };
		},

		async setPassword(idOrEmail: string, password: string): Promise<void> {
			const row = find(idOrEmail);
			if (!row) throw new Error(`no such editor: ${idOrEmail}`);
			if (password.length === 0) throw new Error('password required');
			updateHash.run(await hashPassword(password, scryptParams), row.id);
			// A password change ends every existing session for that editor.
			removeEditorSessions.run(row.id);
		},

		/** Verify credentials. `null` for an unknown email, a wrong password, or
		 * a disabled account — callers must not distinguish between them. */
		async verify(email: string, password: string): Promise<CmsEditor | null> {
			const row = byEmail.get(email.trim().toLowerCase());
			if (!row) {
				// Hash anyway so a missing account isn't measurably faster than a
				// wrong password.
				await verifyPassword(password, 'scrypt$16384$8$1$AAAA$AAAA');
				return null;
			}
			if (row.disabled_at) return null;
			if (!(await verifyPassword(password, row.password_hash))) return null;
			return toEditor(row);
		},

		find: (idOrEmail: string): CmsEditor | null => {
			const row = find(idOrEmail);
			return row ? toEditor(row) : null;
		},
		list: (): CmsEditor[] => listAll.all().map(toEditor),
		listForProject: (projectId: string): CmsEditor[] => editorsFor.all(projectId).map(toEditor),
		delete: (idOrEmail: string): boolean => {
			const row = find(idOrEmail);
			if (!row) return false;
			return removeEditor.run(row.id).changes > 0;
		},
		setDisabled: (idOrEmail: string, disabled: boolean): void => {
			const row = find(idOrEmail);
			if (!row) throw new Error(`no such editor: ${idOrEmail}`);
			setDisabled.run(disabled ? nowIso() : null, row.id);
			if (disabled) removeEditorSessions.run(row.id);
		},

		grant: (idOrEmail: string, projectId: string): void => {
			const row = find(idOrEmail);
			if (!row) throw new Error(`no such editor: ${idOrEmail}`);
			insertGrant.run(projectId, row.id, 'editor', nowIso());
		},
		revoke: (idOrEmail: string, projectId: string): boolean => {
			const row = find(idOrEmail);
			if (!row) return false;
			return removeGrant.run(projectId, row.id).changes > 0;
		},
		can: (editorId: string, projectId: string): boolean =>
			hasGrant.get(projectId, editorId) !== undefined,
		projectsFor: (idOrEmail: string): string[] => {
			const row = find(idOrEmail);
			if (!row) return [];
			return grantsFor.all(row.id).map((r) => r.project_id);
		},

		/** Mint a session and return the raw token for the cookie. Only the
		 * digest is stored. */
		createSession: (editorId: string, opts: { ttlMs?: number } = {}): CmsSessionToken => {
			const token = randomBytes(32).toString('base64url');
			const expiresAt = new Date(Date.now() + (opts.ttlMs ?? DEFAULT_SESSION_TTL_MS));
			insertSession.run(tokenHash(token), editorId, nowIso(), expiresAt.toISOString());
			return { token, expiresAt };
		},
		/** Resolve a raw token to its editor, or `null` when unknown, expired, or
		 * belonging to a disabled account. */
		resolveSession: (token: string): CmsEditor | null => {
			if (!token) return null;
			const row = sessionEditor.get(tokenHash(token), nowIso());
			if (!row || row.disabled_at) return null;
			return toEditor(row);
		},
		destroySession: (token: string): void => {
			if (token) removeSession.run(tokenHash(token));
		},
		purgeExpiredSessions: (): number => removeExpired.run(nowIso()).changes
	};
};

export type CmsSessionToken = { token: string; expiresAt: Date };
export type CmsEditorStore = ReturnType<typeof createEditorStore>;
