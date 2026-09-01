// Verbatim copy of the original `0002_site.sql`, inlined as a template literal.
//
// The runner used `import.meta.glob('./migrations/*.sql', { query: '?raw' })`,
// which is a Vite-only API: it resolves to nothing once this code is a compiled
// dependency inside a consumer's node_modules. Inlining is what makes the
// migrations portable. Escaping: backticks and `${` must be escaped here, and
// nothing else changes.
export const sql = `
-- Add the \`site\` kind: a single project-scoped tree of non-localized,
-- non-route-bound settings (business name, logo, contact, analytics, …).
--
-- Three changes:
--   1. New \`published_site\` table, one row per project.
--   2. Extend the kind CHECK on \`open_release_items\` and \`release_items\` so a
--      site draft item can land in the same release flow as page/layout items.
--      SQLite can't ALTER a CHECK constraint in place, so we rebuild the two
--      tables. Site items use sentinel \`__site__\` values for the route_id /
--      locale / params_hash columns to satisfy the existing NOT NULL columns
--      and the (kind, route_id, locale, params_hash) unique index — only one
--      site draft per user.

PRAGMA foreign_keys = OFF;

CREATE TABLE published_site (
  project_id          TEXT NOT NULL PRIMARY KEY,
  tree                TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  updated_by_release  TEXT NOT NULL
) WITHOUT ROWID;

-- Rebuild open_release_items with 'site' added to the kind CHECK.
CREATE TABLE open_release_items_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('page', 'layout', 'page-delete', 'site')),
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
INSERT INTO open_release_items_new
  (id, project_id, user_id, kind, route_id, locale, params_hash, params, tree, outcome, added_at)
  SELECT id, project_id, user_id, kind, route_id, locale, params_hash, params, tree, outcome, added_at
  FROM open_release_items;
DROP TABLE open_release_items;
ALTER TABLE open_release_items_new RENAME TO open_release_items;
CREATE INDEX idx_ori_release ON open_release_items (project_id, user_id);
CREATE UNIQUE INDEX idx_ori_scope ON open_release_items
  (project_id, user_id, kind, route_id, locale, params_hash);

-- Rebuild release_items with 'site' added to the kind CHECK.
CREATE TABLE release_items_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id      TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('page', 'layout', 'page-delete', 'site')),
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
INSERT INTO release_items_new
  (id, release_id, project_id, seq, kind, route_id, locale, params_hash, params, tree, prior_tree, outcome, prior_tombstone, added_at)
  SELECT id, release_id, project_id, seq, kind, route_id, locale, params_hash, params, tree, prior_tree, outcome, prior_tombstone, added_at
  FROM release_items;
DROP TABLE release_items;
ALTER TABLE release_items_new RENAME TO release_items;
CREATE INDEX idx_ri_release ON release_items (release_id);
CREATE INDEX idx_ri_replay ON release_items (project_id, seq DESC);
CREATE INDEX idx_ri_scope ON release_items
  (project_id, locale, route_id, params_hash, seq DESC);

PRAGMA foreign_keys = ON;
`;
