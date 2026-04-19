/**
 * Staff premises verification routes.
 *
 * Officers and managers review premises ownership claims submitted by applicants.
 * This is distinct from application review — it answers the question
 * "does this person legitimately control this site?" not "should we grant this licence?".
 *
 * Routes:
 *   GET  /api/admin/premises-verifications        — list pending/all verification requests
 *   GET  /api/admin/premises-verifications/:id    — get one premises with full event log
 *   POST /api/admin/premises-verifications/:id/decision — verify, refuse, or request more info
 */

import { getDb } from '../db/client.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireTenantStaff } from '../lib/guards.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

const VALID_DECISIONS = ['verified', 'verification_refused', 'more_information_required'];

// ---------------------------------------------------------------------------
// GET /api/admin/premises-verifications
// ---------------------------------------------------------------------------
async function listVerificationRequests(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const url = new URL(request.url);
  const stateFilter = url.searchParams.get('state') ?? 'pending_verification';

  const sql = getDb(env);

  // Validate state param to prevent injection via string interpolation.
  // We use a raw query only for the optional filter — tenant_id is always parameterised.
  const validStates = [
    'unverified', 'pending_verification', 'verified',
    'verification_refused', 'more_information_required', 'all',
  ];
  if (!validStates.includes(stateFilter)) {
    return error('Invalid state filter', 400);
  }

  const filters = [`p.tenant_id = $1`];
  const params = [session.tenant_id];

  if (stateFilter !== 'all') {
    params.push(stateFilter);
    filters.push(`p.verification_state = $${params.length}`);
  }

  const rows = await sql(`
    SELECT
      p.id,
      p.premises_name,
      p.address_line_1,
      p.address_line_2,
      p.town_or_city,
      p.postcode,
      p.verification_state,
      p.created_at,
      p.updated_at,
      aa.id AS applicant_account_id,
      aa.full_name AS applicant_name,
      aa.email AS applicant_email,
      (
        SELECT pve.created_at
        FROM premises_verification_events pve
        WHERE pve.premises_id = p.id
          AND pve.tenant_id = p.tenant_id
          AND pve.event_type = 'verification_submitted'
        ORDER BY pve.created_at DESC
        LIMIT 1
      ) AS last_submitted_at
    FROM premises p
    INNER JOIN applicant_accounts aa
      ON aa.id = p.applicant_account_id
      AND aa.tenant_id = p.tenant_id
    WHERE ${filters.join(' AND ')}
    ORDER BY
      CASE WHEN p.verification_state = 'pending_verification' THEN 0 ELSE 1 END,
      p.updated_at DESC
  `, params);

  return json({ premises_verifications: rows });
}

// ---------------------------------------------------------------------------
// GET /api/admin/premises-verifications/:id
// ---------------------------------------------------------------------------
async function getVerificationRequest(request, env, premisesId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      p.*,
      aa.full_name AS applicant_name,
      aa.email AS applicant_email,
      aa.phone AS applicant_phone
    FROM premises p
    INNER JOIN applicant_accounts aa
      ON aa.id = p.applicant_account_id
      AND aa.tenant_id = p.tenant_id
    WHERE p.id = ${premisesId}
      AND p.tenant_id = ${session.tenant_id}
    LIMIT 1
  `;

  if (rows.length === 0) return error('Not found', 404);
  const premises = rows[0];

  const events = await sql`
    SELECT
      pve.id,
      pve.event_type,
      pve.actor_type,
      pve.notes,
      pve.created_at,
      CASE pve.actor_type
        WHEN 'applicant' THEN aa.full_name
        WHEN 'officer'   THEN u.full_name
        WHEN 'manager'   THEN u.full_name
        ELSE NULL
      END AS actor_name,
      CASE pve.actor_type
        WHEN 'applicant' THEN aa.email
        WHEN 'officer'   THEN u.email
        WHEN 'manager'   THEN u.email
        ELSE NULL
      END AS actor_email
    FROM premises_verification_events pve
    LEFT JOIN applicant_accounts aa
      ON pve.actor_type = 'applicant' AND aa.id = pve.actor_id
    LEFT JOIN users u
      ON pve.actor_type IN ('officer', 'manager') AND u.id = pve.actor_id
    WHERE pve.tenant_id = ${session.tenant_id}
      AND pve.premises_id = ${premisesId}
    ORDER BY pve.created_at DESC
  `;

  return json({ premises, verification_events: events });
}

// ---------------------------------------------------------------------------
// POST /api/admin/premises-verifications/:id/decision
// Body: { decision: 'verified' | 'verification_refused' | 'more_information_required', notes? }
// ---------------------------------------------------------------------------
async function recordVerificationDecision(request, env, premisesId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const decision = body.decision?.trim();
  const notes = body.notes?.trim() ?? null;

  if (!VALID_DECISIONS.includes(decision)) {
    return error(`decision must be one of: ${VALID_DECISIONS.join(', ')}`);
  }

  const sql = getDb(env);

  const rows = await sql`
    SELECT id, verification_state
    FROM premises
    WHERE id = ${premisesId}
      AND tenant_id = ${session.tenant_id}
    LIMIT 1
  `;

  if (rows.length === 0) return error('Not found', 404);
  const premises = rows[0];

  if (premises.verification_state !== 'pending_verification') {
    return error(
      `Premises must be in pending_verification state to record a decision. Current state: ${premises.verification_state}`,
      409,
    );
  }

  const actorType = session.role === 'manager' ? 'manager' : 'officer';

  await sql`
    UPDATE premises
    SET
      verification_state = ${decision},
      updated_at = NOW()
    WHERE id = ${premisesId}
      AND tenant_id = ${session.tenant_id}
  `;

  await sql`
    INSERT INTO premises_verification_events (
      tenant_id,
      premises_id,
      actor_type,
      actor_id,
      event_type,
      notes
    ) VALUES (
      ${session.tenant_id},
      ${premisesId},
      ${actorType},
      ${session.user_id},
      ${decision},
      ${notes}
    )
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType,
    actorId: session.user_id,
    action: `premises.${decision}`,
    recordType: 'premises',
    recordId: premisesId,
    meta: { notes },
  });

  return json({ ok: true, decision, premises_id: premisesId });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleAdminPremisesVerificationRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/admin/premises-verifications') {
    return listVerificationRequests(request, env);
  }

  const decisionMatch = url.pathname.match(
    /^\/api\/admin\/premises-verifications\/([^/]+)\/decision$/,
  );
  if (decisionMatch && method === 'POST') {
    return recordVerificationDecision(request, env, decisionMatch[1]);
  }

  const detailMatch = url.pathname.match(/^\/api\/admin\/premises-verifications\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    return getVerificationRequest(request, env, detailMatch[1]);
  }

  return null;
}
