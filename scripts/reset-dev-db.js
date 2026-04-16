// Dev database reset script.
// Removes tenant and test data while preserving schema + platform catalogue rows.
// Run: node scripts/reset-dev-db.js --confirm-reset

import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function requireExplicitConfirmation() {
  if (!process.argv.includes('--confirm-reset')) {
    console.error('ERROR: Refusing to reset without --confirm-reset');
    process.exit(1);
  }
}

loadDevVars();
requireExplicitConfirmation();

const connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString.includes('PASTE_YOUR')) {
  console.error('ERROR: DATABASE_URL not set in .dev.vars');
  process.exit(1);
}

const TABLES_TO_CLEAR = [
  'tenant_onboarding_requests',
  'audit_logs',
  'applications',
  'applicant_accounts',
  'tenant_role_assignments',
  'memberships',
  'tenant_enabled_application_types',
  'tenant_limits',
  'users',
  'tenants',
];

async function fetchCounts(client) {
  const counts = {};
  for (const table of [...TABLES_TO_CLEAR, 'application_types']) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = rows[0].count;
  }
  return counts;
}

async function run() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const before = await fetchCounts(client);

    await client.query('BEGIN');
    await client.query(`
      TRUNCATE TABLE
        tenant_onboarding_requests,
        audit_logs,
        applications,
        applicant_accounts,
        tenant_role_assignments,
        memberships,
        tenant_enabled_application_types,
        tenant_limits,
        users,
        tenants
      RESTART IDENTITY CASCADE
    `);
    await client.query('COMMIT');

    const after = await fetchCounts(client);

    console.log('Dev database reset complete.');
    console.log('');
    console.log('Cleared tables:');
    for (const table of TABLES_TO_CLEAR) {
      console.log(`  ${table}: ${before[table]} -> ${after[table]}`);
    }
    console.log('');
    console.log('Preserved platform catalogue:');
    console.log(`  application_types: ${before.application_types} -> ${after.application_types}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
