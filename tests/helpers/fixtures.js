import { randomUUID } from 'crypto';
import { hashPassword } from '../../src/lib/passwords.js';
import { createTestPool, makeTestEmail, makeTestSlug } from './db.js';

export async function createTenantFixture({
  slug = makeTestSlug(randomUUID().slice(0, 8)),
  name = 'Test Council',
  status = 'active',
} = {}) {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, slug, subdomain, status, activated_at)
      VALUES ($1, $2, $2, $3, CASE WHEN $3 = 'active' THEN NOW() ELSE NULL END)
      RETURNING id, name, slug, subdomain, status
    `, [name, slug, status]);

    const tenant = tenantResult.rows[0];

    await client.query(`
      INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
      VALUES ($1, 20, 200)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [tenant.id]);

    await client.query(`
      INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
      SELECT $1, id
      FROM application_types
      WHERE is_active = true
      ON CONFLICT (tenant_id, application_type_id) DO NOTHING
    `, [tenant.id]);

    return tenant;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createApplicantFixture({
  tenantId,
  email = makeTestEmail(`applicant-${randomUUID().slice(0, 8)}`),
  fullName = 'Test Applicant',
  password = 'ApplicantPass123!',
} = {}) {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    const passwordHash = await hashPassword(password);
    const result = await client.query(`
      INSERT INTO applicant_accounts (tenant_id, email, password_hash, full_name, phone)
      VALUES ($1, $2, $3, $4, NULL)
      RETURNING id, tenant_id, email, full_name
    `, [tenantId, email, passwordHash, fullName]);

    return { ...result.rows[0], password };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createPremisesFixture({
  tenantId,
  applicantAccountId,
  premisesName = 'Test Premises',
  addressLine1 = '1 Test Street',
  addressLine2 = null,
  townOrCity = 'Test Town',
  postcode = 'TE1 1ST',
  premisesDescription = null,
} = {}) {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    const result = await client.query(`
      INSERT INTO premises (
        tenant_id,
        applicant_account_id,
        premises_name,
        address_line_1,
        address_line_2,
        town_or_city,
        postcode,
        premises_description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tenantId,
      applicantAccountId,
      premisesName,
      addressLine1,
      addressLine2,
      townOrCity,
      postcode,
      premisesDescription,
    ]);

    return result.rows[0];
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createStaffFixture({
  tenantId,
  role = 'officer',
  email = makeTestEmail(`staff-${randomUUID().slice(0, 8)}`),
  fullName = 'Test Staff',
  password = 'StaffPass123!',
  isPlatformAdmin = false,
} = {}) {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    const passwordHash = await hashPassword(password);
    const userResult = await client.query(`
      INSERT INTO users (email, username, password_hash, full_name, is_platform_admin)
      VALUES ($1, $1, $2, $3, $4)
      RETURNING id, email, username, full_name, is_platform_admin
    `, [email, passwordHash, fullName, isPlatformAdmin]);
    const user = userResult.rows[0];

    if (tenantId) {
      await client.query(`
        INSERT INTO memberships (tenant_id, user_id, role)
        VALUES ($1, $2, $3)
      `, [tenantId, user.id, role]);
    }

    return { ...user, tenant_id: tenantId, role, password };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createApplicationFixture({
  tenantId,
  applicantAccountId,
  premisesId = null,
  status = 'draft',
  assignedUserId = null,
  assignedAt = null,
  submittedAt = null,
} = {}) {
  const pool = createTestPool();
  const client = await pool.connect();

  try {
    const appType = await client.query(`
      SELECT id FROM application_types
      WHERE is_active = true
      ORDER BY slug ASC
      LIMIT 1
    `);

    let resolvedPremisesId = premisesId;
    if (!resolvedPremisesId && applicantAccountId) {
      const premises = await client.query(`
        INSERT INTO premises (
          tenant_id,
          applicant_account_id,
          premises_name,
          address_line_1,
          address_line_2,
          town_or_city,
          postcode,
          premises_description
        )
        VALUES ($1, $2, 'Test Premises', '1 Test Street', NULL, 'Test Town', 'TE1 1ST', NULL)
        RETURNING id
      `, [tenantId, applicantAccountId]);
      resolvedPremisesId = premises.rows[0].id;
    }

    const result = await client.query(`
      INSERT INTO applications (
        tenant_id,
        applicant_account_id,
        application_type_id,
        premises_id,
        applicant_name,
        applicant_email,
        applicant_phone,
        premises_name,
        premises_address,
        premises_postcode,
        premises_description,
        contact_name,
        contact_email,
        contact_phone,
        status,
        assigned_user_id,
        assigned_at,
        submitted_at,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Test Applicant',
        $5,
        NULL,
        'Test Premises',
        '1 Test Street\nTest Town',
        'TE1 1ST',
        NULL,
        'Test Applicant',
        $5,
        NULL,
        $6,
        $7,
        $8,
        COALESCE($9, CASE WHEN $6 = 'draft' THEN NULL ELSE NOW() END),
        CASE WHEN $6 = 'draft' THEN NOW() + INTERVAL '30 days' ELSE NULL END
      )
      RETURNING id, tenant_id, applicant_account_id, status
    `, [
      tenantId,
      applicantAccountId,
      appType.rows[0].id,
      resolvedPremisesId,
      makeTestEmail(`app-ref-${randomUUID().slice(0, 8)}`),
      status,
      assignedUserId,
      assignedAt,
      submittedAt,
    ]);

    return result.rows[0];
  } finally {
    client.release();
    await pool.end();
  }
}
