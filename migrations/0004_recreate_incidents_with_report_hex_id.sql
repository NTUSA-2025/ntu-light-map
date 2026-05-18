DROP TABLE IF EXISTS incidents;

CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_hex_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lighting', 'traffic', 'harassment', 'obstacle', 'other')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 300),
  status TEXT NOT NULL DEFAULT 'public' CHECK (status IN ('public', 'hidden')),
  reporter_email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_incidents_status_created_at
  ON incidents (status, created_at DESC);

CREATE INDEX idx_incidents_reporter_created_at
  ON incidents (reporter_email_hash, created_at DESC);

CREATE INDEX idx_incidents_ip_created_at
  ON incidents (ip_hash, created_at DESC);

CREATE INDEX idx_incidents_report_hex_id
  ON incidents (report_hex_id);
