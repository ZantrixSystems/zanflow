-- Migration: 0020_premises_verification_and_application_type_versioning
-- Created: 2026-04-19
-- Scope: Introduce premises verification state machine, premises verification
-- event log, application type versioning per tenant, and wire applications to
-- a specific type version at creation time.
--
-- Key design decisions recorded here:
-- 1. Premises verification is a separate concern from licence approval.
--    Officers verify an applicant's claim to a site before any licence work begins.
-- 2. Application type versions are per-tenant immutable publishing records.
--    Historical applications reference the version that was active at creation.
--    Retiring a version never mutates historical records.
-- 3. review_mode is added to application_type_versions for future manager-signoff
--    support. The column exists now; the enforcement UI is deferred.

-- ============================================================
-- 1. Add verification_state to premises
-- ============================================================

ALTER TABLE premises
  ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'unverified'
  CONSTRAINT premises_verification_state_values
    CHECK (verification_state IN (
      'unverified',
      'pending_verification',
      'verified',
      'verification_refused',
      'more_information_required'
    ));

CREATE INDEX idx_premises_verification_state
  ON premises (tenant_id, verification_state, updated_at DESC);

-- ============================================================
-- 2. Create premises_verification_events (domain event log)
-- ============================================================
-- Separate from audit_logs: this is the legal record of the
-- verification journey. audit_logs records generic mutations;
-- this table records meaningful domain state transitions.

CREATE TABLE premises_verification_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  premises_id   UUID        NOT NULL REFERENCES premises(id) ON DELETE CASCADE,
  actor_type    TEXT        NOT NULL
    CONSTRAINT pve_actor_type_values CHECK (actor_type IN ('applicant', 'officer', 'manager', 'system')),
  actor_id      UUID        NOT NULL,
  event_type    TEXT        NOT NULL
    CONSTRAINT pve_event_type_values CHECK (event_type IN (
      'verification_submitted',
      'verified',
      'verification_refused',
      'more_information_required',
      'information_provided'
    )),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pve_tenant_premises
  ON premises_verification_events (tenant_id, premises_id, created_at DESC);

CREATE INDEX idx_pve_tenant_pending
  ON premises_verification_events (tenant_id, event_type, created_at DESC);

-- ============================================================
-- 3. Create application_type_versions (per-tenant publishing)
-- ============================================================
-- Each time a tenant admin publishes an application type, a new
-- version record is created. Old versions are retired, not deleted.
-- Applications snapshot the version_id at creation.

CREATE TABLE application_type_versions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  application_type_id   UUID        NOT NULL REFERENCES application_types(id),
  version_number        INT         NOT NULL,
  name_override         TEXT,
  description_override  TEXT,
  publication_status    TEXT        NOT NULL DEFAULT 'draft'
    CONSTRAINT atv_publication_status_values CHECK (
      publication_status IN ('draft', 'published', 'retired')
    ),
  review_mode           TEXT        NOT NULL DEFAULT 'single_officer'
    CONSTRAINT atv_review_mode_values CHECK (
      review_mode IN ('single_officer', 'manager_signoff_required')
    ),
  published_at          TIMESTAMPTZ,
  retired_at            TIMESTAMPTZ,
  published_by_user_id  UUID        REFERENCES users(id),
  retired_by_user_id    UUID        REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT atv_version_unique UNIQUE (tenant_id, application_type_id, version_number)
);

-- Enforce: only one published version per tenant+type at a time.
-- A partial unique index is cleaner than a trigger for MVP.
CREATE UNIQUE INDEX idx_atv_one_published_per_tenant_type
  ON application_type_versions (tenant_id, application_type_id)
  WHERE publication_status = 'published';

CREATE INDEX idx_atv_tenant_status
  ON application_type_versions (tenant_id, publication_status, updated_at DESC);

-- ============================================================
-- 4. Wire applications to a specific version at creation
-- ============================================================
-- Nullable initially so existing records are not broken.
-- New applications must supply this. A NOT NULL constraint
-- will be added once backfill is complete (migration 0021).

ALTER TABLE applications
  ADD COLUMN application_type_version_id UUID
  REFERENCES application_type_versions(id);

CREATE INDEX idx_applications_type_version
  ON applications (tenant_id, application_type_version_id);

-- ============================================================
-- 5. Seed application_type_versions for existing tenant-enabled types
-- ============================================================
-- Creates a version_number=1, publication_status='published' record
-- for every currently-enabled type per tenant, so existing
-- applications can be backfilled and the live system continues to work.

INSERT INTO application_type_versions (
  tenant_id,
  application_type_id,
  version_number,
  publication_status,
  published_at
)
SELECT
  teat.tenant_id,
  teat.application_type_id,
  1,
  'published',
  teat.enabled_at
FROM tenant_enabled_application_types teat;

-- ============================================================
-- 6. Backfill application_type_version_id on existing applications
-- ============================================================
-- Matches each application to the single published version for its
-- tenant + application_type. Safe because step 5 guarantees exactly
-- one published version per tenant+type.

UPDATE applications a
SET application_type_version_id = atv.id
FROM application_type_versions atv
WHERE a.application_type_version_id IS NULL
  AND atv.tenant_id = a.tenant_id
  AND atv.application_type_id = a.application_type_id
  AND atv.publication_status = 'published';
