-- Add TOTP MFA fields to staff users table.
-- totp_secret: AES-256-GCM encrypted TOTP secret (base64). NULL = not enrolled.
-- totp_enabled: true only after user has confirmed their first code.
ALTER TABLE users
  ADD COLUMN totp_secret  TEXT    DEFAULT NULL,
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
