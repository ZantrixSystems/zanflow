-- Migration 0009: tenant subdomain, status, and limits
--
-- Adds the foundation columns needed for subdomain-based multi-tenancy
-- and the tenant lifecycle state machine. Also creates tenant_limits.
--
-- Tenant lifecycle states:
--   pending_verification → trial → active → suspended → expired
--   → scheduled_deletion → deleted
--
-- For current internal tenants (Riverside), status is set to 'active'.

-- ── 1. Add subdomain to tenants ──────────────────────────────────────────────
-- subdomain is the hostname component: e.g. 'riverside' for riverside.zanflow.co.uk
-- Kept separate from slug to allow slug changes without breaking DNS.
-- Format enforced by CHECK: lowercase alphanumeric + hyphens, 2-63 chars.
ALTER TABLE tenants
  ADD COLUMN subdomain TEXT UNIQUE,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT tenants_status_check
    CHECK (status IN (
      'pending_verification',
      'trial',
      'active',
      'suspended',
      'expired',
      'scheduled_deletion',
      'deleted'
    )),
  ADD COLUMN contact_name  TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN trial_started_at       TIMESTAMPTZ,
  ADD COLUMN trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN activated_at           TIMESTAMPTZ,
  ADD COLUMN suspended_at           TIMESTAMPTZ,
  ADD COLUMN expired_at             TIMESTAMPTZ,
  ADD COLUMN scheduled_deletion_at  TIMESTAMPTZ,
  ADD COLUMN deleted_at             TIMESTAMPTZ,
  ADD COLUMN deletion_reason        TEXT;

-- Subdomain format constraint (lowercase alphanumeric + hyphens, 2-63 chars)
ALTER TABLE tenants
  ADD CONSTRAINT tenants_subdomain_format
  CHECK (subdomain ~ '^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]$');

-- Back-fill Riverside with its subdomain and mark as active
UPDATE tenants
   SET subdomain    = 'riverside',
       status       = 'active',
       activated_at = created_at
 WHERE slug = 'riverside';

-- Index for fast hostname resolution on every request
CREATE UNIQUE INDEX idx_tenants_subdomain ON tenants (subdomain)
  WHERE subdomain IS NOT NULL;

CREATE INDEX idx_tenants_status ON tenants (status);

-- ── 2. Create tenant_limits ───────────────────────────────────────────────────
-- One row per tenant. Defaults match trial limits.
-- Platform admin can adjust per-tenant after activation.
CREATE TABLE tenant_limits (
  tenant_id         UUID        NOT NULL PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_staff_users   INT         NOT NULL DEFAULT 3,
  max_applications  INT         NOT NULL DEFAULT 50,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed limits for existing Riverside tenant (active — give it generous limits)
INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
SELECT id, 100, 10000
  FROM tenants
 WHERE slug = 'riverside';
