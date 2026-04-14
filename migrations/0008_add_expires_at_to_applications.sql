-- Migration 0008: add expires_at to applications
--
-- Draft applications expire after 30 days and are hard-deleted by a nightly cron.
-- expires_at is set at creation and cleared (set to NULL) on submission.
-- Submitted/approved/refused applications never expire.

ALTER TABLE applications
  ADD COLUMN expires_at TIMESTAMPTZ;

-- Back-fill: any existing drafts get 30 days from their created_at
UPDATE applications
   SET expires_at = created_at + INTERVAL '30 days'
 WHERE status = 'draft';

-- Index for the nightly cron DELETE — avoids full table scan
CREATE INDEX idx_applications_expires_at
  ON applications (expires_at)
  WHERE expires_at IS NOT NULL;
