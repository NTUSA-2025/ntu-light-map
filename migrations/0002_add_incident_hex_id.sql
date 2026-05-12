ALTER TABLE incidents ADD COLUMN hex_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_incidents_hex_id
  ON incidents (hex_id);
