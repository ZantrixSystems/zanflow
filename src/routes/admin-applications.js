import { getDb } from '../db/client.js';
import { writeAuditLog } from '../lib/audit.js';
import { serialiseApplicationForResponse } from '../lib/field-encryption.js';
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

function buildActorType(session) {
  return session.role;
}

async function loadApplicationForTenant(sql, tenantId, applicationId) {
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
      at.slug AS application_type_slug,
      aa.full_name AS applicant_account_name,
      aa.email AS applicant_account_email,
      assigned_user.full_name AS assigned_user_name,
      assigned_user.email AS assigned_user_email
    FROM applications a
    LEFT JOIN premises p
      ON p.id = a.premises_id
      AND p.tenant_id = a.tenant_id
    LEFT JOIN application_types at ON at.id = a.application_type_id
    LEFT JOIN applicant_accounts aa ON aa.id = a.applicant_account_id
    LEFT JOIN users assigned_user ON assigned_user.id = a.assigned_user_id
    WHERE a.tenant_id = ${tenantId}
      AND a.id = ${applicationId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function loadApplicationDecisions(sql, tenantId, applicationId) {
  return sql`
    SELECT
      d.id,
      d.decision_type,
      d.notes,
      d.created_at,
      u.id AS decided_by_user_id,
      u.full_name AS decided_by_name,
      u.email AS decided_by_email
    FROM decisions d
    INNER JOIN users u ON u.id = d.decided_by_user_id
    WHERE d.tenant_id = ${tenantId}
      AND d.application_id = ${applicationId}
    ORDER BY d.created_at DESC
  `;
}

async function listApplications(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const assigned = url.searchParams.get('assigned');
  const sql = getDb(env);

  const filters = [`a.tenant_id = $1`, `a.status <> 'draft'`];
  const params = [session.tenant_id];

  if (status) {
    params.push(status);
    filters.push(`a.status = $${params.length}`);
  }

  if (assigned === 'mine') {
    params.push(session.user_id);
    filters.push(`a.assigned_user_id = $${params.length}`);
  } else if (assigned === 'unassigned') {
    filters.push(`a.assigned_user_id IS NULL`);
  }

  const rows = await sql(`
    SELECT
      a.id,
      a.status,
      a.premises_id,
      a.premises_name,
      a.premises_postcode,
      a.contact_name,
      a.contact_email,
      a.created_at,
      a.updated_at,
      a.submitted_at,
      a.assigned_at,
      aa.full_name AS applicant_name,
      aa.email AS applicant_email,
      at.name AS application_type_name,
      at.slug AS application_type_slug,
      assigned_user.id AS assigned_user_id,
      assigned_user.full_name AS assigned_user_name,
      assigned_user.email AS assigned_user_email
    FROM applications a
    LEFT JOIN applicant_accounts aa ON aa.id = a.applicant_account_id
    LEFT JOIN application_types at ON at.id = a.application_type_id
    LEFT JOIN users assigned_user ON assigned_user.id = a.assigned_user_id
    WHERE ${filters.join(' AND ')}
    ORDER BY
      CASE WHEN a.status = 'submitted' THEN 0 ELSE 1 END,
      a.updated_at DESC
  `, params);

  return json({ applications: rows });
}

async function getApplication(request, env, applicationId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const application = await loadApplicationForTenant(sql, session.tenant_id, applicationId);
  if (!application) return error('Not found', 404);

  const decisions = await loadApplicationDecisions(sql, session.tenant_id, applicationId);

  return json({
    application: await serialiseApplicationForResponse(application, env),
    decisions,
  });
}

async function assignApplication(request, env, applicationId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const assignedUserId = body.assigned_user_id?.trim();
  if (!assignedUserId) return error('assigned_user_id is required');

  if (session.role === 'officer' && assignedUserId !== session.user_id) {
    return error('Officers can only assign applications to themselves', 403);
  }

  const sql = getDb(env);
  const application = await loadApplicationForTenant(sql, session.tenant_id, applicationId);
  if (!application) return error('Not found', 404);
  if (!['submitted', 'under_review', 'awaiting_information'].includes(application.status)) {
    return error('Application cannot be assigned in its current state', 409);
  }
  if (
    session.role === 'officer'
    && application.assigned_user_id
    && application.assigned_user_id !== session.user_id
  ) {
    return error('Only the assigned officer or a manager can reassign this application', 403);
  }

  const assigneeRows = await sql`
    SELECT u.id, u.full_name, u.email, m.role
    FROM memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ${session.tenant_id}
      AND m.user_id = ${assignedUserId}
    LIMIT 1
  `;
  const assignee = assigneeRows[0];
  if (!assignee) return error('Assignee not found in this tenant', 404);

  const rows = await sql`
    UPDATE applications
    SET
      assigned_user_id = ${assignee.id},
      assigned_at = NOW(),
      status = CASE
        WHEN status = 'submitted' THEN 'under_review'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = ${applicationId}
      AND tenant_id = ${session.tenant_id}
    RETURNING *
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: buildActorType(session),
    actorId: session.user_id,
    action: 'application.assigned',
    recordType: 'application',
    recordId: applicationId,
    meta: {
      assigned_user_id: assignee.id,
      assigned_user_email: assignee.email,
    },
  });

  return json(await serialiseApplicationForResponse(rows[0], env));
}

async function requestInformation(request, env, applicationId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const notes = body.notes?.trim() ?? null;

  const sql = getDb(env);
  const application = await loadApplicationForTenant(sql, session.tenant_id, applicationId);
  if (!application) return error('Not found', 404);
  if (!['submitted', 'under_review'].includes(application.status)) {
    return error('Application cannot request information in its current state', 409);
  }

  const rows = await sql`
    UPDATE applications
    SET
      status = 'awaiting_information',
      assigned_user_id = COALESCE(assigned_user_id, ${session.user_id}),
      assigned_at = COALESCE(assigned_at, NOW()),
      updated_at = NOW()
    WHERE id = ${applicationId}
      AND tenant_id = ${session.tenant_id}
    RETURNING *
  `;

  await sql`
    INSERT INTO decisions (
      tenant_id,
      application_id,
      decided_by_user_id,
      decision_type,
      notes
    )
    VALUES (
      ${session.tenant_id},
      ${applicationId},
      ${session.user_id},
      'request_information',
      ${notes}
    )
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: buildActorType(session),
    actorId: session.user_id,
    action: 'application.information_requested',
    recordType: 'application',
    recordId: applicationId,
    meta: { notes },
  });

  return json(await serialiseApplicationForResponse(rows[0], env));
}

async function recordDecision(request, env, applicationId) {
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
  if (!['approve', 'refuse'].includes(decision)) return error('decision must be approve or refuse');

  const sql = getDb(env);
  const application = await loadApplicationForTenant(sql, session.tenant_id, applicationId);
  if (!application) return error('Not found', 404);
  if (!['submitted', 'under_review'].includes(application.status)) {
    return error('Application cannot be decided in its current state', 409);
  }

  const nextStatus = decision === 'approve' ? 'approved' : 'refused';

  const rows = await sql`
    UPDATE applications
    SET
      status = ${nextStatus},
      assigned_user_id = COALESCE(assigned_user_id, ${session.user_id}),
      assigned_at = COALESCE(assigned_at, NOW()),
      updated_at = NOW()
    WHERE id = ${applicationId}
      AND tenant_id = ${session.tenant_id}
    RETURNING *
  `;

  await sql`
    INSERT INTO decisions (
      tenant_id,
      application_id,
      decided_by_user_id,
      decision_type,
      notes
    )
    VALUES (
      ${session.tenant_id},
      ${applicationId},
      ${session.user_id},
      ${decision},
      ${notes}
    )
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: buildActorType(session),
    actorId: session.user_id,
    action: `application.${decision}d`,
    recordType: 'application',
    recordId: applicationId,
    meta: { notes },
  });

  return json(await serialiseApplicationForResponse(rows[0], env));
}

async function getQueueStats(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status <> 'draft')                          AS total,
      COUNT(*) FILTER (WHERE status = 'submitted')                       AS submitted,
      COUNT(*) FILTER (WHERE assigned_user_id = ${session.user_id}
                         AND status <> 'draft')                          AS assigned_to_me,
      COUNT(*) FILTER (WHERE assigned_user_id IS NULL
                         AND status <> 'draft')                          AS unassigned,
      COUNT(*) FILTER (WHERE status = 'awaiting_information')            AS awaiting_information
    FROM applications
    WHERE tenant_id = ${session.tenant_id}
  `;

  const s = rows[0] ?? {};
  return json({
    stats: {
      total:                Number(s.total ?? 0),
      submitted:            Number(s.submitted ?? 0),
      assigned_to_me:       Number(s.assigned_to_me ?? 0),
      unassigned:           Number(s.unassigned ?? 0),
      awaiting_information: Number(s.awaiting_information ?? 0),
    },
  });
}

export async function handleAdminApplicationRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/admin/queue-stats') {
    return getQueueStats(request, env);
  }

  if (method === 'GET' && url.pathname === '/api/admin/applications') {
    return listApplications(request, env);
  }

  const detailMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    return getApplication(request, env, detailMatch[1]);
  }

  const assignMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/assign$/);
  if (assignMatch && method === 'POST') {
    return assignApplication(request, env, assignMatch[1]);
  }

  const requestInfoMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/request-information$/);
  if (requestInfoMatch && method === 'POST') {
    return requestInformation(request, env, requestInfoMatch[1]);
  }

  const decisionMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)\/decision$/);
  if (decisionMatch && method === 'POST') {
    return recordDecision(request, env, decisionMatch[1]);
  }

  return null;
}
