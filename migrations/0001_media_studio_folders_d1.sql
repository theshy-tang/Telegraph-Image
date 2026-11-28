-- Media Studio preview D1 schema (apply only to a dedicated D1 database).
-- Existing Telegram files and KV image keys remain untouched.
CREATE TABLE IF NOT EXISTS studio_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES studio_folders(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_folders_parent ON studio_folders(parent_id);

CREATE TABLE IF NOT EXISTS studio_media_folders (
  media_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES studio_folders(id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_media_folders_folder ON studio_media_folders(folder_id);
