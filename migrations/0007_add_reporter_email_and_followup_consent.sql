ALTER TABLE incidents
  ADD COLUMN reporter_email TEXT NOT NULL DEFAULT '';

ALTER TABLE incidents
  ADD COLUMN followup_requested INTEGER NOT NULL DEFAULT 0
  CHECK (followup_requested IN (0, 1));
