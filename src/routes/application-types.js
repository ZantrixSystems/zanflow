/**
 * Application types route — public, applicant-facing.
 *
 * Returns the list of application types that have a PUBLISHED version
 * for the current tenant. Serves from application_type_versions so
 * display names and publication state are tenant-controlled.
 *
 * Routes:
 *   GET /api/application-types
 *
 * Auth: none.
 * Tenant: resolved from request hostname.
 */

import { getDb } from '../db/client.js';
import { resolveTenant } from '../lib/tenant-resolver.js';

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
// GET /api/application-types
// ---------------------------------------------------------------------------
async function listApplicationTypes(request, env) {
  const sql = getDb(env);
  const tenant = await resolveTenant(request, sql, env);
  if (!tenant) return error('Tenant not found or not available', 403);

  // Serve from application_type_versions — only published versions are visible.
  // name_override and description_override allow the tenant to customise the
  // public-facing text without altering the platform catalogue.
  const rows = await sql`
    SELECT
      at.id AS application_type_id,
      atv.id AS application_type_version_id,
      at.slug,
      COALESCE(atv.name_override, at.name) AS name,
      COALESCE(atv.description_override, at.description) AS description,
      atv.version_number,
      atv.review_mode
    FROM application_type_versions atv
    INNER JOIN application_types at ON at.id = atv.application_type_id
    WHERE atv.tenant_id = ${tenant.id}
      AND atv.publication_status = 'published'
      AND at.is_active = true
    ORDER BY name ASC
  `;

  return json({ application_types: rows });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleApplicationTypeRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/application-types') {
    return listApplicationTypes(request, env);
  }

  return null;
}
