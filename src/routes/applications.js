/**
 * Applications routes — applicant-facing.
 *
 * All routes require an applicant session.
 * All queries are scoped to both tenant_id AND applicant_account_id —
 * an applicant can never see another applicant's applications,
 * even within the same tenant.
 *
 * Routes:
 *   POST /applications                — start a new draft
 *   GET  /applications                — list this applicant's applications
 *   GET  /applications/:id            — get one application
 *   PUT  /applications/:id            — update a draft
 *   POST /applications/:id/submit     — submit (transition from draft)
 *
 * Field groups (the general form):
 *   Applicant info:  applicant_name, applicant_email, applicant_phone
 *   Premises info:   premises_name, premises_address, premises_postcode, premises_description
 *   Contact info:    contact_name, contact_email, contact_phone
 *   (contact = the person councils should correspond with — may differ from applicant)
 *
 * application_type_id is required at creation.
 * All other fields can be saved as drafts in any order.
 */

import { getDb } from '../db/client.js';
import { getApplicantSession } from '../lib/applicant-session.js';
import { writeAuditLog } from '../lib/audit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// Fields required before submission (not required for draft save)
const SUBMIT_REQUIRED_FIELDS = [
  'applicant_name',
  'applicant_email',
  'premises_name',
  'premises_address',
  'premises_postcode',
];

// ---------------------------------------------------------------------------
// POST /applications
// Start a new draft application. application_type_id required.
// ---------------------------------------------------------------------------
async function createApplication(request, env) {
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const { application_type_id } = body;
  if (!application_type_id) return error('application_type_id is required');

  const sql = getDb(env);

  // Verify the application type is enabled for this tenant
  const typeCheck = await sql`
    SELECT at.id
    FROM application_types at
    INNER JOIN tenant_enabled_application_types teat
      ON teat.application_type_id = at.id
      AND teat.tenant_id = ${session.tenant_id}
    WHERE at.id = ${application_type_id}
      AND at.is_active = true
  `;
  if (typeCheck.length === 0) return error('Application type not available for this tenant', 400);

  const rows = await sql`
    INSERT INTO applications (
      tenant_id,
      applicant_account_id,
      application_type_id,
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
      expires_at
    ) VALUES (
      ${session.tenant_id},
      ${session.applicant_account_id},
      ${application_type_id},
      ${session.full_name},
      ${session.email},
      ${null},
      ${null},
      ${null},
      ${null},
      ${null},
      ${null},
      ${null},
      ${null},
      'draft',
      NOW() + INTERVAL '30 days'
    )
    RETURNING *
  `;

  const application = rows[0];

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     'application.created',
    recordType: 'application',
    recordId:   application.id,
    meta:       { application_type_id },
  });

  return json(application, 201);
}

// ---------------------------------------------------------------------------
// GET /applications
// List this applicant's applications for this tenant.
// ---------------------------------------------------------------------------
async function listApplications(request, env) {
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      a.id,
      a.status,
      a.applicant_name,
      a.premises_name,
      a.created_at,
      a.updated_at,
      a.submitted_at,
      a.expires_at,
      at.name  AS application_type_name,
      at.slug  AS application_type_slug
    FROM applications a
    LEFT JOIN application_types at ON at.id = a.application_type_id
    WHERE a.tenant_id            = ${session.tenant_id}
      AND a.applicant_account_id = ${session.applicant_account_id}
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
    ORDER BY a.updated_at DESC
  `;

  return json({ applications: rows });
}

// ---------------------------------------------------------------------------
// GET /applications/:id
// Fetch a single application — double-scoped to tenant AND applicant.
// ---------------------------------------------------------------------------
async function getApplication(request, env, id) {
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      a.*,
      at.name AS application_type_name,
      at.slug AS application_type_slug
    FROM applications a
    LEFT JOIN application_types at ON at.id = a.application_type_id
    WHERE a.id                   = ${id}
      AND a.tenant_id            = ${session.tenant_id}
      AND a.applicant_account_id = ${session.applicant_account_id}
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
  `;

  if (rows.length === 0) return error('Not found', 404);
  return json(rows[0]);
}

// ---------------------------------------------------------------------------
// PUT /applications/:id
// Save draft fields. Only allowed while status = draft.
// Accepts any subset of form fields — partial saves are valid.
// ---------------------------------------------------------------------------
async function updateApplication(request, env, id) {
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const sql = getDb(env);

  // Fetch and enforce ownership + tenant scope
  const existing = await sql`
    SELECT id, status
    FROM applications
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
  `;

  if (existing.length === 0) return error('Not found', 404);
  if (existing[0].status !== 'draft') {
    return error('Only draft applications can be edited', 409);
  }

  const {
    applicant_phone,
    premises_name,
    premises_address,
    premises_postcode,
    premises_description,
    contact_name,
    contact_email,
    contact_phone,
  } = body;

  // applicant_name and applicant_email are locked at creation from the account —
  // they are legal identity fields and must never be overwritten via the form.
  const has = (field) => Object.prototype.hasOwnProperty.call(body, field);

  const rows = await sql`
    UPDATE applications
    SET
      applicant_phone       = ${has('applicant_phone')       ? (applicant_phone       ?? null) : sql`applicant_phone`},
      premises_name         = ${has('premises_name')         ? (premises_name         ?? null) : sql`premises_name`},
      premises_address      = ${has('premises_address')      ? (premises_address      ?? null) : sql`premises_address`},
      premises_postcode     = ${has('premises_postcode')     ? (premises_postcode     ?? null) : sql`premises_postcode`},
      premises_description  = ${has('premises_description')  ? (premises_description  ?? null) : sql`premises_description`},
      contact_name          = ${has('contact_name')          ? (contact_name          ?? null) : sql`contact_name`},
      contact_email         = ${has('contact_email')         ? (contact_email         ?? null) : sql`contact_email`},
      contact_phone         = ${has('contact_phone')         ? (contact_phone         ?? null) : sql`contact_phone`},
      updated_at            = NOW()
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
    RETURNING *
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     'application.draft_saved',
    recordType: 'application',
    recordId:   id,
  });

  return json(rows[0]);
}

// ---------------------------------------------------------------------------
// POST /applications/:id/submit
// Validate required fields then transition to submitted.
// ---------------------------------------------------------------------------
async function submitApplication(request, env, id) {
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const existing = await sql`
    SELECT *
    FROM applications
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
  `;

  if (existing.length === 0) return error('Not found', 404);
  const app = existing[0];

  if (app.status !== 'draft') {
    return error('Application has already been submitted', 409);
  }

  const missing = SUBMIT_REQUIRED_FIELDS.filter((field) => !app[field]);
  if (missing.length > 0) {
    return error(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  const rows = await sql`
    UPDATE applications
    SET
      status       = 'submitted',
      submitted_at = NOW(),
      updated_at   = NOW(),
      expires_at   = NULL
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
    RETURNING *
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     'application.submitted',
    recordType: 'application',
    recordId:   id,
  });

  return json(rows[0]);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleApplicationRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/applications') {
    return createApplication(request, env);
  }

  if (method === 'GET' && url.pathname === '/api/applications') {
    return listApplications(request, env);
  }

  const idMatch = url.pathname.match(/^\/api\/applications\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'GET') return getApplication(request, env, id);
    if (method === 'PUT') return updateApplication(request, env, id);
  }

  const submitMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/submit$/);
  if (submitMatch && method === 'POST') {
    return submitApplication(request, env, submitMatch[1]);
  }

  return null;
}
