-- Migration: 0021_seed_late_night_refreshment_application_type
-- Created: 2026-04-19
-- Scope: Add the first practical sample application type for MVP testing:
-- "Late Night Refreshment" — stay open after 11pm to sell food and drink.
-- Seeds a published version for all currently active tenants.

-- ============================================================
-- 1. Insert platform application type
-- ============================================================

INSERT INTO application_types (slug, name, description)
VALUES (
  'late_night_refreshment',
  'Late Night Refreshment',
  'Permission to sell hot food or drink between 11pm and 5am on premises open to the public.'
);

-- ============================================================
-- 2. Enable this type for all currently active tenants
-- ============================================================

INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
SELECT
  t.id,
  at.id
FROM tenants t
CROSS JOIN application_types at
WHERE at.slug = 'late_night_refreshment'
  AND t.status = 'active'
ON CONFLICT (tenant_id, application_type_id) DO NOTHING;

-- ============================================================
-- 3. Create a published version for each tenant that now has it enabled
-- ============================================================

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
  NOW()
FROM tenant_enabled_application_types teat
INNER JOIN application_types at ON at.id = teat.application_type_id
WHERE at.slug = 'late_night_refreshment'
ON CONFLICT DO NOTHING;
