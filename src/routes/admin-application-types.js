/**
 * Tenant admin: application type version management.
 *
 * Tenant admins can publish and retire application type versions.
 * They cannot create new platform application types — that is a platform_admin concern.
 *
 * Routes:
 *   GET  /api/admin/application-types              — list platform types with tenant version state
 *   POST /api/admin/application-types/:id/publish  — publish a new version for this tenant
 *   POST /api/admin/application-types/:versionId/retire — retire a published version
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

// ---------------------------------------------------------------------------
// GET /api/admin/application-types
// ---------------------------------------------------------------------------
async function listAdminApplicationTypes(request, env) {
  const session = await requireTenantStaff(request, env, 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  // Return all platform application types, with the current tenant's version
  // state for each (if any). This lets the admin see what is available and
  // what their current publication status is.
  const rows = await sql`
    SELECT
      at.id AS application_type_id,
      at.slug,
      at.name AS platform_name,
      at.description AS platform_description,
      at.is_active AS platform_active,
      atv.id AS version_id,
      atv.version_number,
      atv.name_override,
      atv.description_override,
      atv.publication_status,
      atv.review_mode,
      atv.published_at,
      atv.retired_at,
      atv.created_at AS version_created_at
    FROM application_types at
    LEFT JOIN application_type_versions atv
      ON atv.application_type_id = at.id
      AND atv.tenant_id = ${session.tenant_id}
      AND atv.publication_status IN ('published', 'draft')
    WHERE at.is_active = true
    ORDER BY at.name ASC, atv.version_number DESC
  `;

  return json({ application_types: rows });
}

// ---------------------------------------------------------------------------
// POST /api/admin/application-types/:id/publish
// :id is the platform application_type.id
// Body (all optional):
//   name_override, description_override, review_mode
// ---------------------------------------------------------------------------
async function publishApplicationType(request, env, applicationTypeId) {
  const session = await requireTenantStaff(request, env, 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  let body = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const nameOverride = body.name_override?.trim() || null;
  const descriptionOverride = body.description_override?.trim() || null;
  const reviewMode = body.review_mode?.trim() || 'single_officer';

  if (!['single_officer', 'manager_signoff_required'].includes(reviewMode)) {
    return error('review_mode must be single_officer or manager_signoff_required');
  }

  const sql = getDb(env);

  // Confirm the platform type exists and is active.
  const typeRows = await sql`
    SELECT id, name FROM application_types
    WHERE id = ${applicationTypeId}
      AND is_active = true
    LIMIT 1
  `;
  if (typeRows.length === 0) return error('Application type not found', 404);

  // Retire any currently published version for this tenant+type before creating new one.
  // The unique partial index on (tenant_id, application_type_id) WHERE published enforces
  // only one published version at a time — but we retire gracefully here.
  await sql`
    UPDATE application_type_versions
    SET
      publication_status = 'retired',
      retired_at = NOW(),
      retired_by_user_id = ${session.user_id},
      updated_at = NOW()
    WHERE tenant_id = ${session.tenant_id}
      AND application_type_id = ${applicationTypeId}
      AND publication_status = 'published'
  `;

  // Determine next version number for this tenant+type.
  const maxVersionRows = await sql`
    SELECT COALESCE(MAX(version_number), 0) AS max_version
    FROM application_type_versions
    WHERE tenant_id = ${session.tenant_id}
      AND application_type_id = ${applicationTypeId}
  `;
  const nextVersion = (maxVersionRows[0]?.max_version ?? 0) + 1;

  const insertRows = await sql`
    INSERT INTO application_type_versions (
      tenant_id,
      application_type_id,
      version_number,
      name_override,
      description_override,
      review_mode,
      publication_status,
      published_at,
      published_by_user_id
    ) VALUES (
      ${session.tenant_id},
      ${applicationTypeId},
      ${nextVersion},
      ${nameOverride},
      ${descriptionOverride},
      ${reviewMode},
      'published',
      NOW(),
      ${session.user_id}
    )
    RETURNING *
  `;

  // Also ensure this type is recorded in tenant_enabled_application_types
  // for backward compat with any code that still reads from that table.
  await sql`
    INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
    VALUES (${session.tenant_id}, ${applicationTypeId})
    ON CONFLICT (tenant_id, application_type_id) DO NOTHING
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: 'tenant_admin',
    actorId: session.user_id,
    action: 'application_type_version.published',
    recordType: 'application_type_version',
    recordId: insertRows[0].id,
    meta: {
      application_type_id: applicationTypeId,
      version_number: nextVersion,
      review_mode: reviewMode,
    },
  });

  return json(insertRows[0], 201);
}

// ---------------------------------------------------------------------------
// POST /api/admin/application-types/:versionId/retire
// :versionId is the application_type_versions.id
// ---------------------------------------------------------------------------
async function retireApplicationTypeVersion(request, env, versionId) {
  const session = await requireTenantStaff(request, env, 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const rows = await sql`
    SELECT id, publication_status, application_type_id
    FROM application_type_versions
    WHERE id = ${versionId}
      AND tenant_id = ${session.tenant_id}
    LIMIT 1
  `;

  if (rows.length === 0) return error('Not found', 404);
  const version = rows[0];

  if (version.publication_status !== 'published') {
    return error('Only published versions can be retired', 409);
  }

  await sql`
    UPDATE application_type_versions
    SET
      publication_status = 'retired',
      retired_at = NOW(),
      retired_by_user_id = ${session.user_id},
      updated_at = NOW()
    WHERE id = ${versionId}
      AND tenant_id = ${session.tenant_id}
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: 'tenant_admin',
    actorId: session.user_id,
    action: 'application_type_version.retired',
    recordType: 'application_type_version',
    recordId: versionId,
    meta: { application_type_id: version.application_type_id },
  });

  return json({ ok: true, retired: true, version_id: versionId });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleAdminApplicationTypeRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/admin/application-types') {
    return listAdminApplicationTypes(request, env);
  }

  const publishMatch = url.pathname.match(
    /^\/api\/admin\/application-types\/([^/]+)\/publish$/,
  );
  if (publishMatch && method === 'POST') {
    return publishApplicationType(request, env, publishMatch[1]);
  }

  const retireMatch = url.pathname.match(
    /^\/api\/admin\/application-types\/([^/]+)\/retire$/,
  );
  if (retireMatch && method === 'POST') {
    return retireApplicationTypeVersion(request, env, retireMatch[1]);
  }

  return null;
}
