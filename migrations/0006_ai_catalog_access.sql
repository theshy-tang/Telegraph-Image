CREATE TABLE IF NOT EXISTS studio_ai_catalog_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64)
);
