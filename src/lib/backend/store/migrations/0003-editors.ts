// Editors, project grants, and sessions for the built-in `localEditors()` auth
// adapter.
//
// Purely additive: three new tables, nothing existing is altered or rebuilt, so
// this applies to a live database in place. `project_id` stays an unconstrained
// TEXT key, exactly as it is in every other table here — there is no project
// registry to keep in step. A project is reachable for writes precisely when
// some editor has been granted it, which is what closes the old
// "any [project_id] string creates a tenant on first write" hole.
export const sql = `
CREATE TABLE cms_editors (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  -- Lookups are case-insensitive, but the address is shown back as entered.
  email_lower   TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  disabled_at   TEXT
);

-- Authorization. One row per (project, editor) the editor may edit; the absence
-- of a row is a 403. No FK on project_id for the reason above.
CREATE TABLE cms_project_editors (
  project_id  TEXT NOT NULL,
  editor_id   TEXT NOT NULL REFERENCES cms_editors(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor',
  granted_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, editor_id)
) WITHOUT ROWID;
CREATE INDEX idx_cpe_editor ON cms_project_editors (editor_id);

-- Sessions are stored by SHA-256 of the token, never the token itself, so a
-- database read (a backup, a leaked file) yields nothing that can be replayed
-- as a cookie. The cookie carries the raw token.
CREATE TABLE cms_sessions (
  token_hash   TEXT PRIMARY KEY,
  editor_id    TEXT NOT NULL REFERENCES cms_editors(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT
) WITHOUT ROWID;
CREATE INDEX idx_cms_sessions_editor ON cms_sessions (editor_id);
`;
