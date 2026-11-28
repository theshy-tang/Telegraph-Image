-- Preview-only: editable metadata and durable deletion markers. KV originals stay untouched.
-- statement-boundary
CREATE TABLE IF NOT EXISTS studio_media_metadata (
  media_id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL CHECK(json_valid(metadata)),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  updated_at INTEGER NOT NULL
);
-- statement-boundary
CREATE TRIGGER IF NOT EXISTS studio_membership_active_insert
BEFORE INSERT ON studio_media_folders
WHEN EXISTS (SELECT 1 FROM studio_media_metadata WHERE media_id=NEW.media_id AND deleted=1)
BEGIN SELECT RAISE(ABORT, 'STUDIO_MEDIA_DELETED'); END;
-- statement-boundary
CREATE TRIGGER IF NOT EXISTS studio_membership_active_update
BEFORE UPDATE ON studio_media_folders
WHEN EXISTS (SELECT 1 FROM studio_media_metadata WHERE media_id=NEW.media_id AND deleted=1)
BEGIN SELECT RAISE(ABORT, 'STUDIO_MEDIA_DELETED'); END;
