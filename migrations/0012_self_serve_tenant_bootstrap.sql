-- Migration: 0012_self_serve_tenant_bootstrap
-- Created: 2026-04-16
-- Scope: Self-serve tenant bootstrap for initial tenant admin accounts
--
-- Adds:
-- - tenant activation window for pending self-serve tenants
-- - optional username on staff users
-- - tenant role assignments by email for future SSO / delegated access

ALTER TABLE tenants
  ADD COLUMN activation_expires_at TIMESTAMPTZ,
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX idx_tenants_activation_expires_at
  ON tenants (activation_expires_at)
  WHERE activation_expires_at IS NOT NULL;

ALTER TABLE users
  ADD COLUMN username TEXT;

CREATE UNIQUE INDEX idx_users_username_unique
  ON users (LOWER(username))
  WHERE username IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_username_format
  CHECK (
    username IS NULL
    OR username ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9])?$'
  );

CREATE TABLE tenant_role_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email              TEXT        NOT NULL,
  role               TEXT        NOT NULL
                     CONSTRAINT tenant_role_assignments_role_check
                     CHECK (role IN ('tenant_admin', 'manager', 'officer')),
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CONSTRAINT tenant_role_assignments_status_check
                     CHECK (status IN ('pending', 'active', 'disabled')),
  created_by_user_id UUID        REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tenant_role_assignments_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX idx_tenant_role_assignments_tenant_role
  ON tenant_role_assignments (tenant_id, role);

CREATE INDEX idx_tenant_role_assignments_email
  ON tenant_role_assignments (email);
