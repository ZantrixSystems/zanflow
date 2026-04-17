import { beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetTestData } from '../helpers/db.js';
import {
  createApplicantFixture,
  createApplicationFixture,
  createStaffFixture,
  createTenantFixture,
} from '../helpers/fixtures.js';
import { fetchWorker, getCookie, readJson } from '../helpers/requests.js';

describe('slice 1 - auth foundation', () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it('resolves tenant by host for applicant login happy path', async () => {
    const tenant = await createTenantFixture();
    const applicant = await createApplicantFixture({ tenantId: tenant.id });

    const response = await fetchWorker('https://example.test/api/applicant/login', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        email: applicant.email,
        password: applicant.password,
      },
    });

    expect(response.status).toBe(200);
    expect(getCookie(response, 'applicant_session')).toBeTruthy();
    const json = await readJson(response);
    expect(json.tenant_id).toBe(tenant.id);
    expect(json.applicant.email).toBe(applicant.email);
  });

  it('returns 401 for unauthenticated applicant access', async () => {
    const response = await fetchWorker('https://example.test/api/applicant/me', {
      method: 'GET',
      host: 'test-unauth.zanflo.com',
    });

    expect(response.status).toBe(401);
  });

  it('returns 403 for wrong role on platform admin endpoint', async () => {
    const tenant = await createTenantFixture();
    const staff = await createStaffFixture({ tenantId: tenant.id, role: 'officer' });

    const loginResponse = await fetchWorker('https://example.test/api/staff/login', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        identifier: staff.email,
        password: staff.password,
      },
    });

    expect(loginResponse.status).toBe(200);
    const sessionCookie = getCookie(loginResponse, 'session');
    expect(sessionCookie).toBeTruthy();

    const response = await fetchWorker('https://example.test/api/platform/tenants', {
      method: 'GET',
      host: 'platform.zanflo.com',
      cookie: sessionCookie,
    });

    expect(response.status).toBe(403);
  });

  it('blocks staff login on the wrong tenant host', async () => {
    const tenantA = await createTenantFixture({ slug: 'test-staff-alpha' });
    const tenantB = await createTenantFixture({ slug: 'test-staff-beta' });
    const staff = await createStaffFixture({ tenantId: tenantA.id, role: 'officer' });

    const response = await fetchWorker('https://example.test/api/staff/login', {
      method: 'POST',
      host: `${tenantB.slug}.zanflo.com`,
      body: {
        identifier: staff.email,
        password: staff.password,
      },
    });

    expect(response.status).toBe(401);
  });

  it('allows platform admin login on the explicit platform host and auth route', async () => {
    const admin = await createStaffFixture({
      isPlatformAdmin: true,
      tenantId: null,
      email: 'platform-admin@test-zanflo.test',
    });

    const response = await fetchWorker('https://example.test/api/platform/login', {
      method: 'POST',
      host: 'platform.zanflo.com',
      body: {
        identifier: admin.email,
        password: admin.password,
      },
    });

    expect(response.status).toBe(200);
    expect(getCookie(response, 'session')).toBeTruthy();
  });

  it('rejects platform login on a tenant host', async () => {
    const tenant = await createTenantFixture({ slug: 'test-platform-tenant-host' });
    const admin = await createStaffFixture({
      isPlatformAdmin: true,
      tenantId: null,
      email: 'tenant-host-platform-admin@test-zanflo.test',
    });

    const response = await fetchWorker('https://example.test/api/platform/login', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        identifier: admin.email,
        password: admin.password,
      },
    });

    expect(response.status).toBe(404);
  });

  it('rejects platform login on the apex host', async () => {
    const admin = await createStaffFixture({
      isPlatformAdmin: true,
      tenantId: null,
      email: 'apex-platform-admin@test-zanflo.test',
    });

    const response = await fetchWorker('https://example.test/api/platform/login', {
      method: 'POST',
      host: 'zanflo.com',
      body: {
        identifier: admin.email,
        password: admin.password,
      },
    });

    expect(response.status).toBe(404);
  });

  it('rejects platform tenant listing on a tenant host', async () => {
    const tenant = await createTenantFixture({ slug: 'test-platform-list-tenant' });
    const admin = await createStaffFixture({
      isPlatformAdmin: true,
      tenantId: null,
      email: 'tenant-list-platform-admin@test-zanflo.test',
    });

    const loginResponse = await fetchWorker('https://example.test/api/platform/login', {
      method: 'POST',
      host: 'platform.zanflo.com',
      body: {
        identifier: admin.email,
        password: admin.password,
      },
    });

    const sessionCookie = getCookie(loginResponse, 'session');
    const response = await fetchWorker('https://example.test/api/platform/tenants', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: sessionCookie,
    });

    expect(response.status).toBe(404);
  });

  it('does not expose old mixed auth login in the active runtime', async () => {
    const response = await fetchWorker('https://example.test/api/auth/login', {
      method: 'POST',
      host: 'platform.zanflo.com',
      body: {
        identifier: 'nobody@test-zanflo.test',
        password: 'irrelevant',
      },
    });

    expect(response.status).toBe(404);
  });

  it('does not expose self-service platform signup in the active runtime', async () => {
    const response = await fetchWorker('https://example.test/api/platform/signup', {
      method: 'POST',
      host: 'zanflo.com',
      body: {
        organisation_name: 'Blocked Council',
        admin_name: 'Blocked Admin',
        work_email: 'blocked@test-zanflo.test',
        requested_subdomain: 'blocked-council',
        username: 'blockedadmin',
        password: 'BlockedPass123!',
      },
    });

    expect(response.status).toBe(404);
  });

  it('does not expose bootstrap activation routes in the active runtime', async () => {
    const response = await fetchWorker('https://example.test/api/platform/bootstrap/me', {
      method: 'GET',
      host: 'zanflo.com',
    });

    expect(response.status).toBe(404);
  });

  it('returns public tenant-scoped application types without applicant auth', async () => {
    const tenant = await createTenantFixture({ slug: 'test-public-types' });

    const response = await fetchWorker('https://example.test/api/application-types', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });

    expect(response.status).toBe(200);
    const json = await readJson(response);
    expect(Array.isArray(json.application_types)).toBe(true);
    expect(json.application_types.length).toBeGreaterThan(0);
  });

  it('allows X-Tenant-Slug fallback in test context', async () => {
    const tenant = await createTenantFixture({ slug: 'test-header-fallback' });

    const response = await fetchWorker('https://example.test/api/application-types', {
      method: 'GET',
      headers: {
        'X-Tenant-Slug': tenant.slug,
      },
    });

    expect(response.status).toBe(200);
    const json = await readJson(response);
    expect(json.application_types.length).toBeGreaterThan(0);
  });

  it('blocks X-Tenant-Slug fallback in production context', async () => {
    const tenant = await createTenantFixture({ slug: 'test-header-blocked' });

    const response = await fetchWorker('https://example.test/api/application-types', {
      method: 'GET',
      headers: {
        'X-Tenant-Slug': tenant.slug,
      },
      envOverrides: {
        APP_ENV: 'production',
      },
    });

    expect(response.status).toBe(403);
  });

  it('rejects unauthenticated draft creation from the public apply flow', async () => {
    const tenant = await createTenantFixture({ slug: 'test-apply-auth' });

    const typesResponse = await fetchWorker('https://example.test/api/application-types', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });
    const typesJson = await readJson(typesResponse);

    const response = await fetchWorker('https://example.test/api/applications', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        application_type_id: typesJson.application_types[0].id,
      },
    });

    expect(response.status).toBe(401);
  });

  it('writes an audit log when an authenticated applicant starts a draft', async () => {
    const tenant = await createTenantFixture({ slug: 'test-apply-audit' });
    const applicant = await createApplicantFixture({ tenantId: tenant.id });

    const loginResponse = await fetchWorker('https://example.test/api/applicant/login', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        email: applicant.email,
        password: applicant.password,
      },
    });

    const sessionCookie = getCookie(loginResponse, 'applicant_session');

    const typesResponse = await fetchWorker('https://example.test/api/application-types', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });
    const typesJson = await readJson(typesResponse);

    const createResponse = await fetchWorker('https://example.test/api/applications', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie: sessionCookie,
      body: {
        application_type_id: typesJson.application_types[0].id,
      },
    });

    expect(createResponse.status).toBe(201);
    const application = await readJson(createResponse);

    const pool = createTestPool();
    const client = await pool.connect();

    try {
      const auditResult = await client.query(`
        SELECT action, record_id
        FROM audit_logs
        WHERE tenant_id = $1
          AND actor_type = 'applicant'
          AND actor_id = $2
          AND action = 'application.created'
          AND record_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenant.id, applicant.id, application.id]);

      expect(auditResult.rows).toHaveLength(1);
      expect(auditResult.rows[0].action).toBe('application.created');
    } finally {
      client.release();
      await pool.end();
    }
  }, 10000);

  it('blocks cross-tenant applicant access', async () => {
    const tenantA = await createTenantFixture({ slug: 'test-alpha' });
    const tenantB = await createTenantFixture({ slug: 'test-beta' });
    const applicantA = await createApplicantFixture({ tenantId: tenantA.id });
    const applicationB = await createApplicationFixture({
      tenantId: tenantB.id,
      applicantAccountId: (await createApplicantFixture({ tenantId: tenantB.id })).id,
      status: 'submitted',
    });

    const loginResponse = await fetchWorker('https://example.test/api/applicant/login', {
      method: 'POST',
      host: `${tenantA.slug}.zanflo.com`,
      body: {
        email: applicantA.email,
        password: applicantA.password,
      },
    });

    const sessionCookie = getCookie(loginResponse, 'applicant_session');
    const response = await fetchWorker(`https://example.test/api/applications/${applicationB.id}`, {
      method: 'GET',
      host: `${tenantA.slug}.zanflo.com`,
      cookie: sessionCookie,
    });

    expect(response.status).toBe(404);
  });

  it('blocks applicant login when tenant is not active', async () => {
    const tenant = await createTenantFixture({ slug: 'test-pending', status: 'pending_setup' });
    const applicant = await createApplicantFixture({ tenantId: tenant.id });

    const response = await fetchWorker('https://example.test/api/applicant/login', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      body: {
        email: applicant.email,
        password: applicant.password,
      },
    });

    expect(response.status).toBe(403);
  });
});
