// Seed script — creates test tenant, users, memberships, and enables application types.
// Safe to run multiple times — uses ON CONFLICT DO NOTHING / DO UPDATE.
// Run: node scripts/seed.js

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .dev.vars
// ---------------------------------------------------------------------------
function loadDevVars() {
  const devVarsPath = join(__dirname, '../.dev.vars');
  try {
    const contents = readFileSync(devVarsPath, 'utf8');
    for (const line of contents.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch {
    console.error('ERROR: .dev.vars not found. Create it with DATABASE_URL=...');
    process.exit(1);
  }
}

loadDevVars();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL not set in .dev.vars');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Password hashing (mirrors src/lib/passwords.js — uses Web Crypto in Node 18+)
// ---------------------------------------------------------------------------
const ITERATIONS = 100_000;
const SALT_BYTES = 16;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2:${ITERATIONS}:${bufToHex(salt)}:${bufToHex(new Uint8Array(bits))}`;
}

// ---------------------------------------------------------------------------
// Seed config
// ---------------------------------------------------------------------------
const TENANT_NAME   = 'Riverside Council';
const TENANT_SLUG   = 'riverside';

// Staff accounts only — applicant accounts are created via public registration
const PLATFORM_ADMIN_EMAIL    = 'admin@platform.internal';
const PLATFORM_ADMIN_NAME     = 'Platform Admin';
const PLATFORM_ADMIN_PASSWORD = 'ChangeMe123!';

const OFFICER_EMAIL    = 'officer@riverside.gov.uk';
const OFFICER_NAME     = 'Test Officer';
const OFFICER_PASSWORD = 'ChangeMe123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function upsertTenant(sql, name, slug) {
  const rows = await sql`
    INSERT INTO tenants (name, slug, subdomain, status, activated_at)
    VALUES (${name}, ${slug}, ${slug}, 'active', NOW())
    ON CONFLICT (slug) DO UPDATE
      SET name         = EXCLUDED.name,
          subdomain    = COALESCE(tenants.subdomain, EXCLUDED.subdomain),
          status       = COALESCE(tenants.status, 'active'),
          activated_at = COALESCE(tenants.activated_at, NOW())
    RETURNING id, name, slug, subdomain, status
  `;
  // Upsert limits — no-op if already present
  await sql`
    INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
    VALUES (${rows[0].id}, 100, 10000)
    ON CONFLICT (tenant_id) DO NOTHING
  `;
  return rows[0];
}

async function upsertUser(sql, email, passwordHash, fullName, isPlatformAdmin) {
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, is_platform_admin)
    VALUES (${email}, ${passwordHash}, ${fullName}, ${isPlatformAdmin})
    ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, email
  `;
  return rows[0];
}

async function upsertMembership(sql, tenantId, userId, role) {
  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${tenantId}, ${userId}, ${role})
    ON CONFLICT (tenant_id, user_id) DO NOTHING
  `;
}

async function enableAllApplicationTypes(sql, tenantId) {
  const appTypes = await sql`
    SELECT id, slug FROM application_types WHERE is_active = true
  `;
  for (const appType of appTypes) {
    await sql`
      INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
      VALUES (${tenantId}, ${appType.id})
      ON CONFLICT (tenant_id, application_type_id) DO NOTHING
    `;
    console.log(`  enabled application type: ${appType.slug}`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  const sql = neon(connectionString);

  console.log('\nSeeding...\n');

  // Tenant
  const tenant = await upsertTenant(sql, TENANT_NAME, TENANT_SLUG);
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // Enable application types
  await enableAllApplicationTypes(sql, tenant.id);

  // Platform admin
  console.log('\nHashing passwords...');
  const adminHash   = await hashPassword(PLATFORM_ADMIN_PASSWORD);
  const officerHash = await hashPassword(OFFICER_PASSWORD);

  const adminUser = await upsertUser(sql, PLATFORM_ADMIN_EMAIL, adminHash, PLATFORM_ADMIN_NAME, true);
  console.log(`Platform admin: ${adminUser.email} (${adminUser.id})`);

  // Officer + membership
  const officerUser = await upsertUser(sql, OFFICER_EMAIL, officerHash, OFFICER_NAME, false);
  console.log(`Officer: ${officerUser.email} (${officerUser.id})`);
  await upsertMembership(sql, tenant.id, officerUser.id, 'officer');
  console.log(`  membership: officer @ ${tenant.slug}`);

  console.log('\nSeed complete.');
  console.log('\nStaff login credentials (change these before using in any real environment):');
  console.log(`  Platform admin — email: ${PLATFORM_ADMIN_EMAIL}  password: ${PLATFORM_ADMIN_PASSWORD}`);
  console.log(`  Officer        — email: ${OFFICER_EMAIL}  password: ${OFFICER_PASSWORD}`);
  console.log('\nApplicant accounts are created via the public /applicant/register endpoint.');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
