import { beforeEach, describe, expect, it } from 'vitest';
import { createTestPool, resetTestData } from '../helpers/db.js';
import {
  addSectionToPremiseCaseFixture,
  createApplicantFixture,
  createLicenceSectionFixture,
  createPremiseCaseFixture,
  createStaffFixture,
  createTenantFixture,
} from '../helpers/fixtures.js';
import { fetchWorker, getCookie, readJson } from '../helpers/requests.js';

async function loginStaff(tenantSlug, identifier, password) {
  const response = await fetchWorker('https://example.test/api/staff/login', {
    method: 'POST',
    host: `${tenantSlug}.zanflo.com`,
    body: { identifier, password },
  });
  return getCookie(response, 'session');
}

function csrfHeaders() {
  return { 'X-Requested-With': 'XMLHttpRequest' };
}

describe('slice 13 - external authority case share links', () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it('creates a read-only external share link and exposes only selected sections', async () => {
    const tenant = await createTenantFixture({ slug: 'test-external-share' });
    const officer = await createStaffFixture({ tenantId: tenant.id, role: 'officer' });
    const applicant = await createApplicantFixture({ tenantId: tenant.id });
    const plc = await createPremiseCaseFixture({ tenantId: tenant.id, applicantAccountId: applicant.id });
    const section = await createLicenceSectionFixture({
      tenantId: tenant.id,
      slug: 'alcohol',
      name: 'Alcohol sales',
      fields: [{ key: 'supply_alcohol', label: 'Supply alcohol', type: 'boolean', required: true }],
    });
    await addSectionToPremiseCaseFixture({
      tenantId: tenant.id,
      caseId: plc.id,
      sectionDefinitionId: section.id,
      sectionSlug: section.slug,
      answers: { supply_alcohol: true },
    });

    const cookie = await loginStaff(tenant.slug, officer.email, officer.password);
    const createResponse = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares`, {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
      headers: csrfHeaders(),
      body: {
        authority_name: 'Police Licensing',
        purpose: 'Consultation review',
        expiry_days: 14,
        allowed_sections: ['case_summary', 'licence_sections'],
      },
    });

    expect(createResponse.status).toBe(201);
    const created = await readJson(createResponse);
    expect(created.share.share_url).toContain('/external/case-share/');
    expect(created.share.allowed_sections).toEqual(['case_summary', 'licence_sections']);

    const token = created.share.share_url.split('/').pop();
    const publicResponse = await fetchWorker(`https://example.test/api/external/case-shares/${token}`, {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });

    expect(publicResponse.status).toBe(200);
    const shared = await readJson(publicResponse);
    expect(shared.share.authority_name).toBe('Police Licensing');
    expect(shared.case.case_summary.status).toBe('submitted');
    expect(shared.case.premises).toBeUndefined();
    expect(shared.case.applicant).toBeUndefined();
    expect(shared.sections).toHaveLength(1);
    expect(shared.sections[0].answers.supply_alcohol).toBe(true);

    const pool = createTestPool();
    const client = await pool.connect();
    try {
      const audit = await client.query(`
        SELECT action
        FROM audit_logs
        WHERE tenant_id = $1
          AND record_id = $2
          AND action IN ('external_case_share.created', 'external_case_share.viewed')
        ORDER BY created_at ASC
      `, [tenant.id, plc.id]);
      expect(audit.rows.map((row) => row.action)).toContain('external_case_share.created');
      expect(audit.rows.map((row) => row.action)).toContain('external_case_share.viewed');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('creating a new link revokes the previous active link', async () => {
    const tenant = await createTenantFixture({ slug: 'test-external-replace' });
    const officer = await createStaffFixture({ tenantId: tenant.id, role: 'manager' });
    const applicant = await createApplicantFixture({ tenantId: tenant.id });
    const plc = await createPremiseCaseFixture({ tenantId: tenant.id, applicantAccountId: applicant.id });
    const cookie = await loginStaff(tenant.slug, officer.email, officer.password);

    const first = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares`, {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
      headers: csrfHeaders(),
      body: {
        authority_name: 'Police Licensing',
        expiry_days: 30,
        allowed_sections: ['premises'],
      },
    });
    const firstJson = await readJson(first);

    const second = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares`, {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
      headers: csrfHeaders(),
      body: {
        authority_name: 'Police Licensing',
        expiry_days: 30,
        allowed_sections: ['premises', 'applicant'],
      },
    });
    expect(second.status).toBe(201);

    const oldToken = firstJson.share.share_url.split('/').pop();
    const oldPublicResponse = await fetchWorker(`https://example.test/api/external/case-shares/${oldToken}`, {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });
    expect(oldPublicResponse.status).toBe(404);

    const listResponse = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares`, {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
    });
    const listed = await readJson(listResponse);
    expect(listed.shares).toHaveLength(2);
    expect(listed.shares.filter((share) => share.is_active)).toHaveLength(1);
  });

  it('revoked links cannot be used', async () => {
    const tenant = await createTenantFixture({ slug: 'test-external-revoke' });
    const officer = await createStaffFixture({ tenantId: tenant.id, role: 'officer' });
    const applicant = await createApplicantFixture({ tenantId: tenant.id });
    const plc = await createPremiseCaseFixture({ tenantId: tenant.id, applicantAccountId: applicant.id });
    const cookie = await loginStaff(tenant.slug, officer.email, officer.password);

    const createResponse = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares`, {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
      headers: csrfHeaders(),
      body: {
        authority_name: 'Fire Authority',
        expiry_days: 7,
        allowed_sections: ['premises'],
      },
    });
    const created = await readJson(createResponse);

    const revokeResponse = await fetchWorker(`https://example.test/api/admin/premise-cases/${plc.id}/external-shares/${created.share.id}/revoke`, {
      method: 'POST',
      host: `${tenant.slug}.zanflo.com`,
      cookie,
      headers: csrfHeaders(),
      body: {},
    });
    expect(revokeResponse.status).toBe(200);

    const token = created.share.share_url.split('/').pop();
    const publicResponse = await fetchWorker(`https://example.test/api/external/case-shares/${token}`, {
      method: 'GET',
      host: `${tenant.slug}.zanflo.com`,
    });
    expect(publicResponse.status).toBe(404);
  });
});

