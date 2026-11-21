-- Preview-only structural protection. No media or existing folder rows are changed.
-- statement-boundary
CREATE TRIGGER IF NOT EXISTS studio_folders_guard_insert
AFTER INSERT ON studio_folders
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM studio_folders
    WHERE id <> NEW.id AND parent_id IS NEW.parent_id
      AND name = NEW.name COLLATE NOCASE
  ) THEN RAISE(ABORT, 'STUDIO_FOLDER_DUPLICATE') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM studio_folders) > 1000
    THEN RAISE(ABORT, 'STUDIO_FOLDER_LIMIT') END;
  SELECT CASE WHEN (
    WITH RECURSIVE tree(id, depth) AS (
      SELECT id, 1 FROM studio_folders WHERE parent_id IS NULL
      UNION ALL
      SELECT f.id, tree.depth + 1 FROM studio_folders f
      JOIN tree ON f.parent_id = tree.id WHERE tree.depth < 8
    ) SELECT COUNT(*) FROM tree
  ) <> (SELECT COUNT(*) FROM studio_folders)
    THEN RAISE(ABORT, 'STUDIO_FOLDER_STRUCTURE') END;
END;
-- statement-boundary
CREATE TRIGGER IF NOT EXISTS studio_folders_guard_update
AFTER UPDATE OF name, parent_id ON studio_folders
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM studio_folders
    WHERE id <> NEW.id AND parent_id IS NEW.parent_id
      AND name = NEW.name COLLATE NOCASE
  ) THEN RAISE(ABORT, 'STUDIO_FOLDER_DUPLICATE') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM studio_folders) > 1000
    THEN RAISE(ABORT, 'STUDIO_FOLDER_LIMIT') END;
  SELECT CASE WHEN (
    WITH RECURSIVE tree(id, depth) AS (
      SELECT id, 1 FROM studio_folders WHERE parent_id IS NULL
      UNION ALL
      SELECT f.id, tree.depth + 1 FROM studio_folders f
      JOIN tree ON f.parent_id = tree.id WHERE tree.depth < 8
    ) SELECT COUNT(*) FROM tree
  ) <> (SELECT COUNT(*) FROM studio_folders)
    THEN RAISE(ABORT, 'STUDIO_FOLDER_STRUCTURE') END;
END;
