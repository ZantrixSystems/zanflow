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
 *   Premises info:   premises_id plus snapshot fields on the application for
 *                    legal traceability over time
 *   Contact info:    contact_name, contact_email, contact_phone
 *   (contact = the person councils should correspond with — may differ from applicant)
 *
 * application_type_id and premises_id are required at creation.
 * All other fields can be saved as drafts in any order.
 */

import { getDb } from '../db/client.js';
import { requireApplicant } from '../lib/guards.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  encryptApplicationApplicantPhone,
  serialiseApplicationForResponse,
} from '../lib/field-encryption.js';
import { buildApplicationPremisesSnapshot } from '../lib/premises.js';

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
// Start a new draft application. application_type_id and premises_id required.
// ---------------------------------------------------------------------------
async function createApplication(request, env) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const { application_type_id, premises_id } = body;
  if (!application_type_id) return error('application_type_id is required');
  if (!premises_id) return error('premises_id is required');

  const sql = getDb(env);

  // Enforce tenant application limit
  const limitCheck = await sql`
    SELECT tl.max_applications,
           COUNT(a.id)::int AS current_count
    FROM tenant_limits tl
    LEFT JOIN applications a
      ON a.tenant_id = ${session.tenant_id}
    WHERE tl.tenant_id = ${session.tenant_id}
    GROUP BY tl.max_applications
  `;
  if (limitCheck.length > 0 && limitCheck[0].current_count >= limitCheck[0].max_applications) {
    return error('Application limit reached for this tenant', 403);
  }

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

  const premisesRows = await sql`
    SELECT *
    FROM premises
    WHERE id = ${premises_id}
      AND tenant_id = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
    LIMIT 1
  `;
  if (premisesRows.length === 0) return error('Premises not found for this applicant', 404);

  // Enforce: applicants may only create applications against verified premises.
  // This is a backend guard — the frontend may also block this, but the backend
  // is the authoritative check.
  if (premisesRows[0].verification_state !== 'verified') {
    return error(
      'Applications can only be created against a verified premises. Submit your premises for verification first.',
      409,
    );
  }

  // Resolve the currently published application type version for this tenant.
  // This is snapshotted on the application so historical records remain stable
  // even after the version is retired.
  const versionRows = await sql`
    SELECT id
    FROM application_type_versions
    WHERE tenant_id = ${session.tenant_id}
      AND application_type_id = ${application_type_id}
      AND publication_status = 'published'
    LIMIT 1
  `;
  if (versionRows.length === 0) {
    return error('No published version of this application type is available for this tenant', 400);
  }
  const applicationTypeVersionId = versionRows[0].id;

  const premisesSnapshot = buildApplicationPremisesSnapshot(premisesRows[0]);

  const rows = await sql`
    INSERT INTO applications (
      tenant_id,
      applicant_account_id,
      application_type_id,
      application_type_version_id,
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
      expires_at
    ) VALUES (
      ${session.tenant_id},
      ${session.applicant_account_id},
      ${application_type_id},
      ${applicationTypeVersionId},
      ${premises_id},
      ${session.full_name},
      ${session.email},
      ${null},
      ${premisesSnapshot.premises_name},
      ${premisesSnapshot.premises_address},
      ${premisesSnapshot.premises_postcode},
      ${premisesSnapshot.premises_description},
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
    meta:       { application_type_id, premises_id },
  });

  return json(await serialiseApplicationForResponse(application, env), 201);
}

// ---------------------------------------------------------------------------
// GET /applications
// List this applicant's applications for this tenant.
// ---------------------------------------------------------------------------
async function listApplications(request, env) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      a.id,
      a.status,
      a.applicant_name,
      a.premises_id,
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
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      a.*,
      p.address_line_1,
      p.address_line_2,
      p.town_or_city,
      p.postcode AS linked_premises_postcode,
      p.premises_name AS linked_premises_name,
      p.premises_description AS linked_premises_description,
      at.name AS application_type_name,
      at.slug AS application_type_slug
    FROM applications a
    LEFT JOIN premises p
      ON p.id = a.premises_id
      AND p.tenant_id = a.tenant_id
    LEFT JOIN application_types at ON at.id = a.application_type_id
    WHERE a.id                   = ${id}
      AND a.tenant_id            = ${session.tenant_id}
      AND a.applicant_account_id = ${session.applicant_account_id}
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
  `;

  if (rows.length === 0) return error('Not found', 404);
  return json(await serialiseApplicationForResponse(rows[0], env));
}

// ---------------------------------------------------------------------------
// PUT /applications/:id
// Save draft fields. Only allowed while status = draft.
// Accepts any subset of form fields — partial saves are valid.
// ---------------------------------------------------------------------------
async function updateApplication(request, env, id) {
  const session = await requireApplicant(request, env);
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
    SELECT id, status, tenant_id, premises_id
    FROM applications
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
  `;

  if (existing.length === 0) return error('Not found', 404);
  if (!['draft', 'awaiting_information'].includes(existing[0].status)) {
    return error('Only draft or awaiting-information applications can be edited', 409);
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
  const encryptedApplicantPhone = has('applicant_phone')
    ? await encryptApplicationApplicantPhone(applicant_phone, {
        tenantId: existing[0].tenant_id,
        applicationId: id,
      }, env)
    : null;

  // Build SET clause dynamically — neon tagged template does not support nested
  // sql`` fragments, so we only include fields that are actually being updated.
  const setClauses = [];
  const params = [];

  const addField = (col, value) => {
    params.push(value ?? null);
    setClauses.push(`${col} = $${params.length}`);
  };

  if (has('applicant_phone')) {
    addField('applicant_phone',                  encryptedApplicantPhone.ciphertext);
    addField('applicant_phone_kms_key_name',     encryptedApplicantPhone.kmsKeyName);
    addField('applicant_phone_kms_key_version',  encryptedApplicantPhone.kmsKeyVersion);
    addField('applicant_phone_encryption_scheme', encryptedApplicantPhone.encryptionScheme);
  }
  if (!existing[0].premises_id) {
    if (has('premises_name'))        addField('premises_name',        premises_name);
    if (has('premises_address'))     addField('premises_address',     premises_address);
    if (has('premises_postcode'))    addField('premises_postcode',    premises_postcode);
    if (has('premises_description')) addField('premises_description', premises_description);
  }
  if (has('contact_name'))         addField('contact_name',         contact_name);
  if (has('contact_email'))        addField('contact_email',        contact_email);
  if (has('contact_phone'))        addField('contact_phone',        contact_phone);

  setClauses.push('updated_at = NOW()');

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(session.tenant_id);
  const tenantParam = `$${params.length}`;
  params.push(session.applicant_account_id);
  const accountParam = `$${params.length}`;

  const query = `
    UPDATE applications
    SET ${setClauses.join(', ')}
    WHERE id = ${idParam}
      AND tenant_id = ${tenantParam}
      AND applicant_account_id = ${accountParam}
    RETURNING *
  `;

  const rows = await sql(query, params);

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     existing[0].status === 'awaiting_information'
      ? 'application.information_response_saved'
      : 'application.draft_saved',
    recordType: 'application',
    recordId:   id,
  });

  return json(await serialiseApplicationForResponse(rows[0], env));
}

// ---------------------------------------------------------------------------
// POST /applications/:id/submit
// Validate required fields then transition to submitted.
// ---------------------------------------------------------------------------
async function submitApplication(request, env, id) {
  const session = await requireApplicant(request, env);
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

  if (!['draft', 'awaiting_information'].includes(app.status)) {
    return error('Application cannot be submitted in its current state', 409);
  }

  const missing = SUBMIT_REQUIRED_FIELDS.filter((field) => !app[field]);
  if (missing.length > 0) {
    return error(`Missing required fields: ${missing.join(', ')}`, 400);
  }

  const rows = await sql`
    UPDATE applications
    SET
      status       = CASE
        WHEN status = 'awaiting_information' THEN 'under_review'
        ELSE 'submitted'
      END,
      submitted_at = CASE
        WHEN status = 'draft' THEN NOW()
        ELSE submitted_at
      END,
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
    action:     app.status === 'awaiting_information'
      ? 'application.information_submitted'
      : 'application.submitted',
    recordType: 'application',
    recordId:   id,
  });

  return json(await serialiseApplicationForResponse(rows[0], env));
}

// ---------------------------------------------------------------------------
// DELETE /applications/:id
// Hard-delete a draft. Only allowed while status = draft.
// ---------------------------------------------------------------------------
async function deleteApplication(request, env, id) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);

  const existing = await sql`
    SELECT id, status
    FROM applications
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
  `;

  if (existing.length === 0) return error('Not found', 404);
  if (existing[0].status !== 'draft') {
    return error('Only draft applications can be deleted', 409);
  }

  await sql`
    DELETE FROM applications
    WHERE id                   = ${id}
      AND tenant_id            = ${session.tenant_id}
      AND applicant_account_id = ${session.applicant_account_id}
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     'application.deleted',
    recordType: 'application',
    recordId:   id,
  });

  return json({ deleted: true });
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
    if (method === 'GET')    return getApplication(request, env, id);
    if (method === 'PUT')    return updateApplication(request, env, id);
    if (method === 'DELETE') return deleteApplication(request, env, id);
  }

  const submitMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/submit$/);
  if (submitMatch && method === 'POST') {
    return submitApplication(request, env, submitMatch[1]);
  }

  return null;
}
