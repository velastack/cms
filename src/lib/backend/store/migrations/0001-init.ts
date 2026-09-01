// Verbatim copy of the original `0001_init.sql`, inlined as a template literal.
//
// The runner used `import.meta.glob('./migrations/*.sql', { query: '?raw' })`,
// which is a Vite-only API: it resolves to nothing once this code is a compiled
// dependency inside a consumer's node_modules. Inlining is what makes the
// migrations portable. Escaping: backticks and `${` must be escaped here, and
// nothing else changes.
export const sql = `
-- Live published state for pages. One row per (project, locale, route, params).
-- Hot-path read: GET /docs?kind=page&... is one PK lookup against this table.
CREATE TABLE published_pages (
  project_id          TEXT NOT NULL,
  locale              TEXT NOT NULL,
  route_id            TEXT NOT NULL,
  params_hash         TEXT NOT NULL,
  params              TEXT NOT NULL,
  tree                TEXT NOT NULL,
  tombstone           TEXT,
  updated_at          TEXT NOT NULL,
  updated_by_release  TEXT NOT NULL,
  PRIMARY KEY (project_id, locale, route_id, params_hash)
) WITHOUT ROWID;
CREATE INDEX idx_pp_listing ON published_pages (project_id, locale, route_id);
CREATE INDEX idx_pp_param_values ON published_pages (project_id, route_id);

-- Live published state for layouts. One row per (project, locale, route).
CREATE TABLE published_layouts (
  project_id          TEXT NOT NULL,
  locale              TEXT NOT NULL,
  route_id            TEXT NOT NULL,
  tree                TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  updated_by_release  TEXT NOT NULL,
  PRIMARY KEY (project_id, locale, route_id)
) WITHOUT ROWID;

-- Published release headers, in monotonic order (\`seq\` per project).
CREATE TABLE releases (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  name          TEXT,
  published_by  TEXT NOT NULL,
  published_at  TEXT NOT NULL,
  preview_key   TEXT NOT NULL,
  reverted_at   TEXT
);
CREATE UNIQUE INDEX idx_releases_seq ON releases (project_id, seq DESC);
CREATE UNIQUE INDEX idx_releases_preview ON releases (project_id, preview_key);
CREATE INDEX idx_releases_history ON releases (project_id, published_at DESC);

-- Append-only log of every published item. Drives ?version=<key> reads,
-- revert (capture priorTree at publish, replay to undo), and history view.
CREATE TABLE release_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id      TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('page', 'layout', 'page-delete')),
  route_id        TEXT NOT NULL,
  locale          TEXT NOT NULL,
  params_hash     TEXT,
  params          TEXT,
  tree            TEXT,
  prior_tree      TEXT,
  outcome         TEXT,
  prior_tombstone TEXT,
  added_at        TEXT NOT NULL
);
CREATE INDEX idx_ri_release ON release_items (release_id);
CREATE INDEX idx_ri_replay ON release_items (project_id, seq DESC);
CREATE INDEX idx_ri_scope ON release_items
  (project_id, locale, route_id, params_hash, seq DESC);

-- One open (draft) release per (project, user). Drafts overlay published reads
-- when a request carries ?preview=<open_releases.preview_key>.
CREATE TABLE open_releases (
  project_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  name        TEXT,
  created_at  TEXT NOT NULL,
  preview_key TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE UNIQUE INDEX idx_or_preview ON open_releases (project_id, preview_key);

-- Items in open releases. UNIQUE on scope so addReleaseItems can UPSERT-merge.
-- params_hash is '' (canonical empty) for layouts to fit the unique constraint.
CREATE TABLE open_release_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('page', 'layout', 'page-delete')),
  route_id     TEXT NOT NULL,
  locale       TEXT NOT NULL,
  params_hash  TEXT NOT NULL DEFAULT '',
  params       TEXT,
  tree         TEXT,
  outcome      TEXT,
  added_at     TEXT NOT NULL,
  FOREIGN KEY (project_id, user_id)
    REFERENCES open_releases(project_id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_ori_release ON open_release_items (project_id, user_id);
CREATE UNIQUE INDEX idx_ori_scope ON open_release_items
  (project_id, user_id, kind, route_id, locale, params_hash);

-- Media library metadata. Files themselves live on disk under static/uploads/.
CREATE TABLE media_items (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  url           TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL
);
CREATE INDEX idx_media_listing ON media_items (project_id, uploaded_at DESC, id);

-- Per-project version stamp. Bumped on every publish. Used as an ETag basis
-- and to invalidate the in-process LRU cache.
CREATE TABLE project_state (
  project_id        TEXT PRIMARY KEY,
  cms_version       INTEGER NOT NULL DEFAULT 0,
  last_release_seq  INTEGER NOT NULL DEFAULT 0
);
`;
