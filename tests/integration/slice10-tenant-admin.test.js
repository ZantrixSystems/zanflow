import { beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetTestData } from '../helpers/db.js';
import { createStaffFixture, createTenantFixture } from '../helpers/fixtures.js';
import { fetchWorker, getCookie, readJson } from '../helpers/requests.js';

async function loginStaff(tenantSlug, identifier, password) {
  const response = await fetchWorker('https://example.test/api/staff/login', {
    method: 'POST',
    host: `${tenantSlug}.zanflo.com`,
    body: { identifier, password },
  });
  return getCookie(response, 'session');
}

describe('slice 10 - tenant admin basics', () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it('only tenant_admin can access users settings and audit', async () => {
    const tenant = await createTenantFixture({ slug: 'test-tenant-admin-role' });
    const officer = await createStaffFixture({ tenantId: tenant.id, role: 'officer' });
    const officerCookie = await loginStaff(tenant.slug, officer.email, officer.password);

    const usersResponse = await fetchWorker('https://example.test/api/admin/users', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: officerCookie,
    });
    const settingsResponse = await fetchWorker('https://example.test/api/admin/settings', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: officerCookie,
    });
    const applicationSetupResponse = await fetchWorker('https://example.test/api/admin/application-setup', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: officerCookie,
    });
    const auditResponse = await fetchWorker('https://example.test/api/admin/audit', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: officerCookie,
    });

    expect(usersResponse.status).toBe(403);
    expect(settingsResponse.status).toBe(403);
    expect(applicationSetupResponse.status).toBe(403);
    expect(auditResponse.status).toBe(403);
  });

  it('tenant user creation and update are tenant scoped and audited', async () => {
    const tenant = await createTenantFixture({ slug: 'test-tenant-user-admin' });
    const admin = await createStaffFixture({ tenantId: tenant.id, role: 'tenant_admin' });
    const adminCookie = await loginStaff(tenant.slug, admin.email, admin.password);

    const createResponse = await fetchWorker('https://example.test/api/admin/users', {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie: adminCookie,
      body: {
        email: 'new-tenant-user@test-zanflo.test',
        full_name: 'New Tenant User',
        role: 'officer',
        password: 'StrongPassword123!',
      },
    });

    expect(createResponse.status).toBe(201);
    const created = await readJson(createResponse);
    expect(created.user.username).toBe('new-tenant-user@test-zanflo.test');

    const updateResponse = await fetchWorker(`https://example.test/api/admin/users/${created.user.id}`, {
      method: 'PUT',
      host: `${tenant.slug}.zanflo.com`,
      cookie: adminCookie,
      body: {
        role: 'manager',
        full_name: 'Updated Tenant User',
      },
    });

    expect(updateResponse.status).toBe(200);

    const pool = createTestPool();
    const client = await pool.connect();
    try {
      const membership = await client.query(`
        SELECT role
        FROM memberships
        WHERE tenant_id = $1 AND user_id = $2
      `, [tenant.id, created.user.id]);
      expect(membership.rows[0].role).toBe('manager');

      const audit = await client.query(`
        SELECT action
        FROM audit_logs
        WHERE tenant_id = $1
          AND actor_id = $2
          AND record_id = $3
          AND action IN ('tenant_user.created', 'tenant_user.updated')
        ORDER BY action ASC
      `, [tenant.id, admin.id, created.user.id]);
      expect(audit.rows).toHaveLength(2);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('audit endpoint returns only current tenant rows', async () => {
    const tenantA = await createTenantFixture({ slug: 'test-audit-a' });
    const tenantB = await createTenantFixture({ slug: 'test-audit-b' });
    const adminA = await createStaffFixture({ tenantId: tenantA.id, role: 'tenant_admin' });
    const adminB = await createStaffFixture({ tenantId: tenantB.id, role: 'tenant_admin' });
    const cookieA = await loginStaff(tenantA.slug, adminA.email, adminA.password);
    const cookieB = await loginStaff(tenantB.slug, adminB.email, adminB.password);

    await fetchWorker('https://example.test/api/admin/settings', {
      method: 'PUT',
      host: `${tenantA.slug}.zanflo.com`,
      cookie: cookieA,
      body: {
        organisation: {
          support_contact_name: 'Tenant A Contact',
          support_email: 'tenant-a-contact@test-zanflo.test',
        },
      },
    });

    await fetchWorker('https://example.test/api/admin/settings', {
      method: 'PUT',
      host: `${tenantB.slug}.zanflo.com`,
      cookie: cookieB,
      body: {
        organisation: {
          support_contact_name: 'Tenant B Contact',
          support_email: 'tenant-b-contact@test-zanflo.test',
        },
      },
    });

    const response = await fetchWorker('https://example.test/api/admin/audit', {
      method: 'GET',
      host: `${tenantA.slug}.zanflo.com`,
      cookie: cookieA,
    });

    expect(response.status).toBe(200);
    const json = await readJson(response);
    expect(json.audit_logs.length).toBeGreaterThan(0);
    expect(json.audit_logs.every((row) => row.actor !== 'Tenant B Contact')).toBe(true);
  }, 10000);

  it('tenant admin can save branding and SSO config without leaking the client secret back', async () => {
    const tenant = await createTenantFixture({ slug: 'test-tenant-settings-save' });
    const admin = await createStaffFixture({ tenantId: tenant.id, role: 'tenant_admin' });
    const adminCookie = await loginStaff(tenant.slug, admin.email, admin.password);

    const updateResponse = await fetchWorker('https://example.test/api/admin/settings', {
      method: 'PUT',
      host: `${tenant.slug}.zanflo.com`,
      cookie: adminCookie,
      envOverrides: {
        SECRET_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      },
      body: {
        organisation: {
          council_name: 'Test Tenant Settings Save Council',
          council_display_name: 'Test Tenant Settings Save Council',
          support_contact_name: 'Licensing Team',
          support_email: 'licensing@test-zanflo.test',
          support_phone: '01234 567890',
          internal_admin_name: 'Admin User',
          internal_admin_email: admin.email,
        },
        branding: {
          logo_url: 'https://example.test/logo.png',
          welcome_text: 'Welcome to the tenant licensing service.',
          public_homepage_text: 'Create an applicant account and begin your premises licence application.',
          contact_us_text: 'Contact the licensing team if you need help.',
        },
        sso: {
          saml_enabled: true,
          saml_metadata_xml: '<xml>metadata</xml>',
          saml_entity_id: 'urn:test:zanflo',
          saml_login_url: 'https://idp.example.test/login',
          saml_certificate: '-----BEGIN CERTIFICATE-----test-----END CERTIFICATE-----',
          oidc_enabled: true,
          oidc_client_id: 'client-id-123',
          oidc_client_secret: 'secret-value-123',
          oidc_client_secret_id: 'secret-id-1',
          oidc_directory_id: 'directory-id-1',
          oidc_issuer: 'https://issuer.example.test',
          oidc_authorization_endpoint: 'https://issuer.example.test/authorize',
          oidc_token_endpoint: 'https://issuer.example.test/token',
          oidc_userinfo_endpoint: 'https://issuer.example.test/userinfo',
          oidc_scopes: 'openid profile email',
        },
      },
    });

    expect(updateResponse.status).toBe(200);
    const updated = await readJson(updateResponse);
    expect(updated.settings.branding.welcome_text).toBe('Welcome to the tenant licensing service.');
    expect(updated.settings.sso.has_oidc_client_secret).toBe(true);
    expect(updated.settings.sso.oidc_client_secret_hint).toBe('se...23');
    expect(updated.settings.sso.oidc_client_secret).toBeUndefined();

    const publicResponse = await fetchWorker('https://example.test/api/tenant/public-config', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });

    expect(publicResponse.status).toBe(200);
    const publicJson = await readJson(publicResponse);
    expect(publicJson.tenant.display_name).toBe('Test Tenant Settings Save Council');
    expect(publicJson.tenant.welcome_text).toBe('Welcome to the tenant licensing service.');
  }, 10000);

  it('tenant admin owns application setup and officers do not', async () => {
    const tenant = await createTenantFixture({ slug: 'test-tenant-application-setup' });
    const admin = await createStaffFixture({ tenantId: tenant.id, role: 'tenant_admin' });
    const officer = await createStaffFixture({ tenantId: tenant.id, role: 'officer' });
    const adminCookie = await loginStaff(tenant.slug, admin.email, admin.password);
    const officerCookie = await loginStaff(tenant.slug, officer.email, officer.password);

    const forbiddenResponse = await fetchWorker('https://example.test/api/admin/application-setup', {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie: officerCookie,
    });
    expect(forbiddenResponse.status).toBe(403);

    const updateResponse = await fetchWorker('https://example.test/api/admin/application-setup', {
      method: 'PUT',
      host: `${tenant.slug}.zanflo.com`,
      cookie: adminCookie,
      body: {
        copy: {
          application_intro_text: 'Use your saved premises to begin.',
          applicant_guidance_text: 'Contact details can be changed per application.',
        },
        field_settings: [
          {
            field_key: 'contact_phone',
            label_override: 'Case contact phone',
            help_text: 'Best number for case updates',
            enabled: true,
            required: false,
            sensitive: true,
          },
        ],
      },
    });

    expect(updateResponse.status).toBe(200);
    const json = await readJson(updateResponse);
    expect(json.setup.copy.application_intro_text).toBe('Use your saved premises to begin.');
    expect(json.setup.field_settings.find((field) => field.field_key === 'contact_phone')?.label_override)
      .toBe('Case contact phone');
  });
});
