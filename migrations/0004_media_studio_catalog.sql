-- Derived search inventory only. Original KV values and Telegram files are untouched.
CREATE TABLE IF NOT EXISTS studio_media_inventory (
  media_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK(media_type IN ('image','video','other')),
  uploaded_at INTEGER NOT NULL,
  metadata TEXT NOT NULL CHECK(json_valid(metadata)),
  indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_inventory_date ON studio_media_inventory(uploaded_at,media_id);
CREATE INDEX IF NOT EXISTS idx_studio_inventory_type_date ON studio_media_inventory(media_type,uploaded_at,media_id);
CREATE TABLE IF NOT EXISTS studio_catalog_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1))
);
INSERT OR IGNORE INTO studio_catalog_state(id,ready) VALUES (1,0);
