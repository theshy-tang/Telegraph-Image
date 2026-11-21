-- Durable original records for Studio uploads; existing KV records stay in place.
CREATE TABLE IF NOT EXISTS studio_media_records (
 media_id TEXT PRIMARY KEY,
 metadata TEXT NOT NULL CHECK(json_valid(metadata)),
 kv_pending INTEGER NOT NULL DEFAULT 1 CHECK(kv_pending IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_records_pending ON studio_media_records(kv_pending,media_id);
