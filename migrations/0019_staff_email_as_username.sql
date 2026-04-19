-- Migration: 0019_staff_email_as_username
-- Created: 2026-04-19
-- Scope: use staff email addresses as the only sign-in identifier

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_format;

UPDATE users
SET username = LOWER(email)
WHERE username IS NULL
   OR username <> LOWER(email);

ALTER TABLE users
  ADD CONSTRAINT users_username_matches_email
  CHECK (
    username IS NULL
    OR LOWER(username) = LOWER(email)
  );
