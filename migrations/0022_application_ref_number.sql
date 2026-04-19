-- Migration: 0022_application_ref_number
-- Adds a global auto-incrementing ref_number to applications.
-- Displayed as {TENANT_SLUG_PREFIX}-{zero-padded ref_number}, e.g. MOUN-000001.
-- The prefix is derived at read time from the tenant slug — not stored here.

ALTER TABLE applications
  ADD COLUMN ref_number BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX idx_applications_ref_number ON applications (ref_number);
