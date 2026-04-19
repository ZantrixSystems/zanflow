/**
 * Dev seed: Riverside15 tenant with realistic case management data.
 *
 * Creates:
 *   - 1 tenant: Riverside15 Council
 *   - 1 tenant admin, 3 officers, 1 manager
 *   - 5 applicants, 2 premises each (10 premises total)
 *   - Mix of premises verification states (pending, verified, refused, more_info)
 *   - Mix of applications across multiple types and statuses
 *   - Mix of assigned / unassigned cases
 *
 * Run: node scripts/seed-riverside15.js
 * Credentials: all passwords = Password123!Riverside
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const path = join(__dirname, '../.dev.vars');
  try {
    const contents = readFileSync(path, 'utf8');
    for (const line of contents.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch {
    console.error('ERROR: .dev.vars not found.');
    process.exit(1);
  }
}

loadDevVars();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('ERROR: DATABASE_URL not set'); process.exit(1); }

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2:${ITERATIONS}:${bufToHex(salt)}:${bufToHex(new Uint8Array(bits))}`;
}

const PASSWORD = 'Password123!Riverside';
const SLUG = 'riverside15';
const DOMAIN = 'riverside15.gov.uk';

async function run() {
  const sql = neon(connectionString);
  const hash = await hashPassword(PASSWORD);
  console.log('\nPassword hash ready. Seeding Riverside15...\n');

  // -------------------------------------------------------------------------
  // Tenant
  // -------------------------------------------------------------------------
  const [tenant] = await sql`
    INSERT INTO tenants (name, slug, subdomain, status, activated_at)
    VALUES ('Riverside15 Council', ${SLUG}, ${SLUG}, 'active', NOW())
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, slug
  `;
  console.log(`Tenant: ${tenant.name} (${tenant.slug}) [${tenant.id}]`);

  await sql`INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications) VALUES (${tenant.id}, 100, 10000) ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO tenant_settings (tenant_id, council_display_name, support_contact_name, support_email, welcome_text, public_homepage_text, contact_us_text)
    VALUES (${tenant.id}, 'Riverside15 Council', 'Licensing Team', ${'licensing@' + DOMAIN}, 'Welcome to Riverside15 licensing.', 'Apply for your premises licence online.', 'Contact the licensing team for help.')
    ON CONFLICT DO NOTHING
  `;
  await sql`INSERT INTO tenant_sso_configs (tenant_id) VALUES (${tenant.id}) ON CONFLICT DO NOTHING`;

  // Enable all active application types and create published versions
  const appTypes = await sql`SELECT id, slug, name FROM application_types WHERE is_active = true`;
  for (const at of appTypes) {
    await sql`INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id) VALUES (${tenant.id}, ${at.id}) ON CONFLICT DO NOTHING`;
    await sql`
      INSERT INTO application_type_versions (tenant_id, application_type_id, version_number, publication_status, published_at)
      VALUES (${tenant.id}, ${at.id}, 1, 'published', NOW())
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`Enabled ${appTypes.length} application types`);

  // -------------------------------------------------------------------------
  // Staff: 1 admin, 1 manager, 3 officers
  // -------------------------------------------------------------------------
  const [tadmin] = await sql`
    INSERT INTO users (email, password_hash, full_name, is_platform_admin)
    VALUES (${'admin@' + DOMAIN}, ${hash}, 'Sarah Chen', false)
    ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, email
  `;
  await sql`INSERT INTO memberships (tenant_id, user_id, role) VALUES (${tenant.id}, ${tadmin.id}, 'tenant_admin') ON CONFLICT DO NOTHING`;
  console.log(`  Tenant admin: ${tadmin.email}`);

  const [manager] = await sql`
    INSERT INTO users (email, password_hash, full_name, is_platform_admin)
    VALUES (${'manager@' + DOMAIN}, ${hash}, 'James Okafor', false)
    ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, email
  `;
  await sql`INSERT INTO memberships (tenant_id, user_id, role) VALUES (${tenant.id}, ${manager.id}, 'manager') ON CONFLICT DO NOTHING`;
  console.log(`  Manager: ${manager.email}`);

  const officerData = [
    { email: `officer1@${DOMAIN}`, name: 'Priya Sharma' },
    { email: `officer2@${DOMAIN}`, name: 'Tom Wallace' },
    { email: `officer3@${DOMAIN}`, name: 'Aisha Patel' },
  ];
  const officers = [];
  for (const o of officerData) {
    const [u] = await sql`
      INSERT INTO users (email, password_hash, full_name, is_platform_admin)
      VALUES (${o.email}, ${hash}, ${o.name}, false)
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id, email
    `;
    await sql`INSERT INTO memberships (tenant_id, user_id, role) VALUES (${tenant.id}, ${u.id}, 'officer') ON CONFLICT DO NOTHING`;
    officers.push(u);
    console.log(`  Officer: ${u.email}`);
  }

  // -------------------------------------------------------------------------
  // Applicants + premises
  // -------------------------------------------------------------------------
  const applicantData = [
    { name: 'Marco Rossi',      email: `marco@${SLUG}-residents.test` },
    { name: 'Helen Davies',     email: `helen@${SLUG}-residents.test` },
    { name: 'Kwame Asante',     email: `kwame@${SLUG}-residents.test` },
    { name: 'Emma Thornton',    email: `emma@${SLUG}-residents.test` },
    { name: 'Rajan Mehta',      email: `rajan@${SLUG}-residents.test` },
  ];

  const premisesMatrix = [
    [
      { name: 'The Crown & Anchor', addr1: '14 Riverside Road',   city: 'Riverside',   postcode: 'RV1 1AA', desc: 'Traditional public house with beer garden' },
      { name: 'Riverside Diner',    addr1: '2 Market Street',     city: 'Riverside',   postcode: 'RV1 1BB', desc: 'Casual dining restaurant, 80 covers' },
    ],
    [
      { name: 'The Blue Note',      addr1: '55 Canal Street',     city: 'Riverside',   postcode: 'RV2 3CC', desc: 'Live music venue, capacity 200' },
      { name: 'Corner Convenience', addr1: '8 Oak Avenue',        city: 'Northside',   postcode: 'RV2 4DD', desc: 'Small convenience store' },
    ],
    [
      { name: 'Asante Catering',    addr1: '22 Industrial Way',   city: 'Riverside',   postcode: 'RV3 5EE', desc: 'Commercial kitchen for catering events' },
      { name: 'Spice Garden',       addr1: '91 High Street',      city: 'Riverside',   postcode: 'RV1 2FF', desc: 'Indian restaurant, licensed premises' },
    ],
    [
      { name: 'The Old Brewery',    addr1: '1 Brewery Lane',      city: 'Eastfield',   postcode: 'RV4 7GG', desc: 'Craft brewery and taproom, Grade II listed' },
      { name: 'Night Owl Bar',      addr1: '33 Station Road',     city: 'Riverside',   postcode: 'RV1 3HH', desc: 'Late-night bar, open until 3am' },
    ],
    [
      { name: 'Mehta Mart',         addr1: '17 New Street',       city: 'Riverside',   postcode: 'RV1 4JJ', desc: 'Convenience store with off-licence' },
      { name: 'The Rooftop Lounge', addr1: '100 Bridge Street',   city: 'Riverside',   postcode: 'RV1 5KK', desc: 'Rooftop bar and events space' },
    ],
  ];

  // Premises verification states to cycle through
  const pvStates = [
    'pending_verification',
    'verified',
    'pending_verification',
    'more_information_required',
    'verified',
    'verification_refused',
    'pending_verification',
    'verified',
    'pending_verification',
    'pending_verification',
  ];

  const allPremises = [];
  const applicants = [];

  for (let i = 0; i < applicantData.length; i++) {
    const a = applicantData[i];
    const [applicant] = await sql`
      INSERT INTO applicant_accounts (tenant_id, email, password_hash, full_name)
      VALUES (${tenant.id}, ${a.email}, ${hash}, ${a.name})
      ON CONFLICT (tenant_id, email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id, email
    `;
    applicants.push(applicant);
    console.log(`  Applicant: ${applicant.email}`);

    for (let j = 0; j < premisesMatrix[i].length; j++) {
      const p = premisesMatrix[i][j];
      const pvIdx = i * 2 + j;
      const pvState = pvStates[pvIdx];

      const [premises] = await sql`
        INSERT INTO premises (tenant_id, applicant_account_id, premises_name, address_line_1, town_or_city, postcode, premises_description, verification_state)
        VALUES (${tenant.id}, ${applicant.id}, ${p.name}, ${p.addr1}, ${p.city}, ${p.postcode}, ${p.desc}, ${pvState})
        ON CONFLICT DO NOTHING
        RETURNING id, premises_name, verification_state
      `;

      if (!premises) {
        // Already exists — fetch it
        const [existing] = await sql`
          SELECT id, premises_name, verification_state FROM premises
          WHERE tenant_id = ${tenant.id} AND applicant_account_id = ${applicant.id} AND premises_name = ${p.name}
        `;
        allPremises.push({ ...existing, applicantId: applicant.id, applicantName: a.name });
        console.log(`    Premises (existing): ${p.name}`);
        continue;
      }

      allPremises.push({ ...premises, applicantId: applicant.id, applicantName: a.name });
      console.log(`    Premises: ${premises.premises_name} [${premises.verification_state}]`);

      // Seed the verification event to make the event log meaningful
      if (pvState !== 'unverified') {
        await sql`
          INSERT INTO premises_verification_events (tenant_id, premises_id, actor_type, actor_id, event_type, notes)
          VALUES (${tenant.id}, ${premises.id}, 'applicant', ${applicant.id}, 'verification_submitted', NULL)
        `;
      }
      if (pvState === 'verified') {
        await sql`
          INSERT INTO premises_verification_events (tenant_id, premises_id, actor_type, actor_id, event_type, notes)
          VALUES (${tenant.id}, ${premises.id}, 'officer', ${officers[0].id}, 'verified', 'Ownership documents confirmed.')
        `;
      }
      if (pvState === 'verification_refused') {
        await sql`
          INSERT INTO premises_verification_events (tenant_id, premises_id, actor_type, actor_id, event_type, notes)
          VALUES (${tenant.id}, ${premises.id}, 'officer', ${officers[1].id}, 'verification_refused', 'Documents insufficient. Unable to verify ownership claim.')
        `;
      }
      if (pvState === 'more_information_required') {
        await sql`
          INSERT INTO premises_verification_events (tenant_id, premises_id, actor_type, actor_id, event_type, notes)
          VALUES (${tenant.id}, ${premises.id}, 'officer', ${officers[2].id}, 'more_information_required', 'Please provide a recent utility bill in your name for this address.')
        `;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Applications — only on verified premises
  // -------------------------------------------------------------------------
  // Only create applications against verified premises (realistic)
  const verifiedPremises = allPremises.filter(p => p.verification_state === 'verified');
  console.log(`\n  Creating applications on ${verifiedPremises.length} verified premises...`);

  // Get enabled types with published versions
  const enabledTypes = await sql`
    SELECT
      at.id AS type_id,
      at.slug,
      at.name,
      atv.id AS version_id
    FROM tenant_enabled_application_types teat
    INNER JOIN application_types at ON at.id = teat.application_type_id
    INNER JOIN application_type_versions atv
      ON atv.tenant_id = teat.tenant_id
      AND atv.application_type_id = teat.application_type_id
      AND atv.publication_status = 'published'
    WHERE teat.tenant_id = ${tenant.id}
  `;

  if (enabledTypes.length === 0) {
    console.log('  No enabled application types found — skipping applications.');
  } else {
    // Scenario matrix: realistic mix of statuses and assignments
    const scenarios = [
      // [premises idx, type idx, status, assignedOfficerIdx (null = unassigned)]
      [0, 0, 'submitted',            null],
      [0, 1, 'under_review',         0],
      [1, 0, 'awaiting_information', 1],
      [1, 1, 'approved',             0],
      [2, 0, 'submitted',            null],
      [2, 0, 'under_review',         2],
      [3, 1, 'refused',              1],
      [3, 0, 'submitted',            null],
      [3, 0, 'awaiting_information', 2],
      [0, 1, 'under_review',         0],
      [1, 0, 'submitted',            null],
      [2, 1, 'approved',             1],
    ];

    for (const [pIdx, tIdx, status, officerIdx] of scenarios) {
      if (pIdx >= verifiedPremises.length) continue;
      if (tIdx >= enabledTypes.length) continue;

      const premises = verifiedPremises[pIdx];
      const type = enabledTypes[tIdx];
      const assignedUserId = officerIdx !== null ? officers[officerIdx]?.id : null;

      // Find applicant account from premises
      const [applicantAccount] = await sql`
        SELECT id, email FROM applicant_accounts WHERE id = ${premises.applicantId} AND tenant_id = ${tenant.id}
      `;
      if (!applicantAccount) continue;

      const submittedAt = status !== 'draft' ? 'NOW()' : null;
      const assignedAt  = assignedUserId ? 'NOW()' : null;

      try {
        const daysAgo = Math.floor(Math.random() * 30);
        const updatedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
        const submittedAtVal = status !== 'draft' ? new Date(Date.now() - daysAgo * 86400000).toISOString() : null;
        const assignedAtVal = assignedUserId ? new Date(Date.now() - daysAgo * 86400000).toISOString() : null;
        const postcode = `RV${Math.floor(Math.random() * 5) + 1} ${Math.floor(Math.random() * 9) + 1}AA`;

        const [app] = await sql`
          INSERT INTO applications (
            tenant_id,
            applicant_account_id,
            application_type_id,
            application_type_version_id,
            premises_id,
            premises_name,
            premises_postcode,
            status,
            assigned_user_id,
            assigned_at,
            submitted_at,
            contact_name,
            contact_email,
            updated_at
          )
          VALUES (
            ${tenant.id},
            ${applicantAccount.id},
            ${type.type_id},
            ${type.version_id},
            ${premises.id},
            ${premises.premises_name},
            ${postcode},
            ${status},
            ${assignedUserId},
            ${assignedAtVal},
            ${submittedAtVal},
            ${premises.applicantName},
            ${applicantAccount.email},
            ${updatedAt}
          )
          RETURNING id, ref_number
        `;
        console.log(`    Application: ${type.slug} / ${status} / ${assignedUserId ? `assigned officer${officerIdx + 1}` : 'unassigned'} [ref ${app.ref_number}]`);

        // Add a decision record for decided cases
        if (status === 'approved' || status === 'refused') {
          const decisionType = status === 'approved' ? 'approve' : 'refuse';
          const deciderId = assignedUserId ?? officers[0].id;
          await sql`
            INSERT INTO decisions (tenant_id, application_id, decided_by_user_id, decision_type, notes)
            VALUES (${tenant.id}, ${app.id}, ${deciderId}, ${decisionType}, 'Decision recorded during seed data setup.')
          `;
        }
        if (status === 'awaiting_information') {
          const deciderId = assignedUserId ?? officers[0].id;
          await sql`
            INSERT INTO decisions (tenant_id, application_id, decided_by_user_id, decision_type, notes)
            VALUES (${tenant.id}, ${app.id}, ${deciderId}, 'request_information', 'Please supply additional supporting documents.')
          `;
        }
      } catch (err) {
        console.warn(`    Skipped application (${err.message.slice(0, 60)})`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n--- RIVERSIDE15 CREDENTIALS (password: Password123!Riverside) ---\n');
  console.log('  Tenant admin:  admin@riverside15.gov.uk');
  console.log('  Manager:       manager@riverside15.gov.uk');
  console.log('  Officer 1:     officer1@riverside15.gov.uk  (Priya Sharma)');
  console.log('  Officer 2:     officer2@riverside15.gov.uk  (Tom Wallace)');
  console.log('  Officer 3:     officer3@riverside15.gov.uk  (Aisha Patel)');
  console.log('');
  console.log('  Applicants:');
  for (const a of applicantData) {
    console.log(`    ${a.email}`);
  }
  console.log('');
  console.log(`Sign in at: https://riverside15.zanflo.com/admin`);
  console.log('');
}

run().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
