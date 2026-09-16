// Who published a release, as they were at the time.
//
// `published_by` is an opaque editor id, which is all the auth adapter
// promises to keep stable — and all the admin bar could show. The publisher's
// email and name are now captured on the row at publish time, so history reads
// the same under any adapter and survives the account being renamed or
// removed. Existing rows are filled from `cms_editors` where the id still
// resolves; the rest stay null and readers fall back to the id.
export const sql = `
ALTER TABLE releases ADD COLUMN published_by_email TEXT;
ALTER TABLE releases ADD COLUMN published_by_name TEXT;
UPDATE releases SET
  published_by_email = (SELECT e.email FROM cms_editors e WHERE e.id = releases.published_by),
  published_by_name  = (SELECT e.name  FROM cms_editors e WHERE e.id = releases.published_by);
`;
