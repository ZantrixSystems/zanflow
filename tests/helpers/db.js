import { Pool } from '@neondatabase/serverless';
import { loadTestEnv } from './env.js';

const TEST_TENANT_PREFIX = 'test-';
const TEST_EMAIL_FRAGMENT = '@test-';

export function createTestPool() {
  const env = loadTestEnv();
  return new Pool({ connectionString: env.DATABASE_URL });
}

export async function resetTestData() {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      DELETE FROM tenant_bootstrap_tokens
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR user_id IN (
           SELECT id FROM users WHERE email LIKE '%@test-%'
         )
    `);

    await client.query(`
      DELETE FROM tenant_sso_configs
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM tenant_settings
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR bootstrap_admin_user_id IN (
           SELECT id FROM users WHERE email LIKE '%@test-%'
         )
    `);

    await client.query(`
      DELETE FROM tenant_application_field_settings
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM tenant_application_settings
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM external_case_shares
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR created_by_user_id IN (
           SELECT id FROM users WHERE email LIKE '%@test-%'
         )
    `);

    await client.query(`
      DELETE FROM audit_logs
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR (meta->>'work_email') LIKE '%@test-%'
         OR (meta->>'email') LIKE '%@test-%'
    `);

    await client.query(`
      DELETE FROM decisions
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR decided_by_user_id IN (
           SELECT id FROM users WHERE email LIKE '%@test-%'
         )
    `);

    await client.query(`
      DELETE FROM applications
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM case_events
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM case_selected_sections
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM premise_licence_cases
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM licence_section_definitions
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM premises_verification_events
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM premises
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM application_type_versions
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM applicant_accounts
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR email LIKE '%@test-%'
    `);

    await client.query(`
      DELETE FROM memberships
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR user_id IN (
           SELECT id FROM users WHERE email LIKE '%@test-%'
         )
    `);

    await client.query(`
      DELETE FROM tenant_role_assignments
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
         OR email LIKE '%@test-%'
    `);

    await client.query(`
      DELETE FROM tenant_enabled_application_types
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM tenant_limits
      WHERE tenant_id IN (
        SELECT id FROM tenants WHERE slug LIKE 'test-%'
      )
    `);

    await client.query(`
      DELETE FROM users
      WHERE email LIKE '%@test-%'
    `);

    await client.query(`
      DELETE FROM tenant_onboarding_requests
      WHERE requested_subdomain LIKE 'test-%'
         OR work_email LIKE '%@test-%'
    `);

    await client.query(`
      DELETE FROM tenants
      WHERE slug LIKE 'test-%'
         OR subdomain LIKE 'test-%'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export function makeTestSlug(suffix) {
  return `${TEST_TENANT_PREFIX}${suffix}`;
}

export function makeTestEmail(localPart) {
  return `${localPart}${TEST_EMAIL_FRAGMENT}example.com`;
}
