CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
