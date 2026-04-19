-- Migration: 0024_saved_filters
-- Created: 2026-04-19
-- Scope: Introduce per-user saved filter presets for the unified case queue.
--
-- Design intent:
--   Filters are stored as a JSON object of key/value pairs (AND logic only).
--   The structure is intentionally simple — no query language, no AST.
--   This is the foundation layer. A JQL-style parser can be added later
--   without schema changes: the filter_json column can hold either the
--   simple object shape or a richer one once a parser exists.
--
--   is_default: the user's preferred view on login. At most one per user
--   per tenant, enforced by the partial unique index below.

CREATE TABLE saved_filters (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  filter_json JSONB       NOT NULL DEFAULT '{}',
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT saved_filters_name_per_user UNIQUE (tenant_id, user_id, name)
);

CREATE INDEX idx_saved_filters_user ON saved_filters (tenant_id, user_id, updated_at DESC);

-- At most one default filter per user per tenant.
CREATE UNIQUE INDEX idx_saved_filters_default
  ON saved_filters (tenant_id, user_id)
  WHERE is_default = TRUE;
