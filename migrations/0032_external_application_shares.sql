-- External authority share links for read-only premise licence case access.
-- Tokens are bearer credentials; only a SHA-256 hash is stored.

CREATE TABLE external_case_shares (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  case_id             UUID        NOT NULL REFERENCES premise_licence_cases(id) ON DELETE CASCADE,
  authority_name      TEXT        NOT NULL,
  contact_name        TEXT,
  purpose             TEXT,
  allowed_sections    JSONB       NOT NULL,
  token_hash          TEXT        NOT NULL UNIQUE,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  revoked_by_user_id  UUID        REFERENCES users(id),
  replaced_by_share_id UUID       REFERENCES external_case_shares(id),
  created_by_user_id  UUID        NOT NULL REFERENCES users(id),
  first_viewed_at     TIMESTAMPTZ,
  last_viewed_at      TIMESTAMPTZ,
  view_count          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT external_case_shares_sections_array
    CHECK (jsonb_typeof(allowed_sections) = 'array'),
  CONSTRAINT external_case_shares_expiry_after_create
    CHECK (expires_at > created_at),
  CONSTRAINT external_case_shares_revoked_by_required
    CHECK (
      (revoked_at IS NULL AND revoked_by_user_id IS NULL)
      OR
      (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    )
);

CREATE INDEX idx_external_case_shares_tenant_case
  ON external_case_shares (tenant_id, case_id);

CREATE INDEX idx_external_case_shares_active
  ON external_case_shares (tenant_id, case_id, expires_at)
  WHERE revoked_at IS NULL;
