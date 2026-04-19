/**
 * Unified case queue for officers and managers.
 *
 * A "case" is the single UI concept covering two domain types:
 *   - premises_verification  (source: premises table, verification_state column)
 *   - application            (source: applications table, status column)
 *
 * Both are surfaced in one table using a UNION ALL with a common column shape.
 * Case type is explicit on every row so the UI can route detail links correctly.
 *
 * Routes:
 *   GET  /api/admin/cases               — unified paginated case list
 *   GET  /api/admin/cases/stats         — queue stat counts (both types)
 *   GET  /api/admin/saved-filters       — list user's saved filters
 *   POST /api/admin/saved-filters       — create saved filter
 *   PUT  /api/admin/saved-filters/:id   — update saved filter
 *   DELETE /api/admin/saved-filters/:id — delete saved filter
 */

import { getDb } from '../db/client.js';
import { requireTenantStaff } from '../lib/guards.js';
import { writeAuditLog } from '../lib/audit.js';

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
// Shared filter parsing
// ---------------------------------------------------------------------------

/**
 * Parse common query params into a normalised filter object.
 * Used by both listCases and getStats so counts always match the list.
 */
function parseFilters(url, session) {
  return {
    status:        url.searchParams.get('status') || null,
    assigned:      url.searchParams.get('assigned') || null,
    caseType:      url.searchParams.get('case_type') || null,
    typeSlug:      url.searchParams.get('type') || null,
    createdDays:   url.searchParams.get('created_days') ? Number(url.searchParams.get('created_days')) : null,
    sort:          url.searchParams.get('sort') || 'updated',
    // Resolved at call time so the session is always current
    _userId:       session.user_id,
    _tenantId:     session.tenant_id,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/cases
// ---------------------------------------------------------------------------
async function listCases(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const url = new URL(request.url);
  const f = parseFilters(url, session);
  const sql = getDb(env);

  const SORT_COLS = {
    updated: 'case_updated_at DESC',
    created: 'case_created_at DESC',
    type:    'case_type ASC, case_updated_at DESC',
    status:  'case_status ASC, case_updated_at DESC',
  };
  const orderBy = SORT_COLS[f.sort] ?? SORT_COLS.updated;

  // Build both halves of the UNION with separate params arrays.
  // We use raw-string query form (sql(...)) for both because of the UNION.
  // All user-supplied values are bound as positional params — no interpolation.

  const appFilters  = [`a.tenant_id = $1`, `a.status <> 'draft'`];
  const pvFilters   = [`p.tenant_id = $1`];
  const params      = [f._tenantId];

  // --- status ---
  if (f.status) {
    // Status values differ between the two types; route them to the right half.
    const pvStatuses = ['unverified', 'pending_verification', 'verified', 'verification_refused', 'more_information_required'];
    const appStatuses = ['submitted', 'under_review', 'awaiting_information', 'approved', 'refused'];

    if (pvStatuses.includes(f.status)) {
      params.push(f.status);
      pvFilters.push(`p.verification_state = $${params.length}`);
      // Exclude application rows entirely when filtering to a pv-only status
      appFilters.push(`FALSE`);
    } else if (appStatuses.includes(f.status)) {
      params.push(f.status);
      appFilters.push(`a.status = $${params.length}`);
      pvFilters.push(`FALSE`);
    }
  }

  // --- case_type ---
  if (f.caseType === 'premises_verification') {
    appFilters.push(`FALSE`);
  } else if (f.caseType === 'application') {
    pvFilters.push(`FALSE`);
  }

  // --- assigned ---
  if (f.assigned === 'mine') {
    params.push(f._userId);
    appFilters.push(`a.assigned_user_id = $${params.length}`);
    // Premises verifications don't have assignment yet — show none
    pvFilters.push(`FALSE`);
  } else if (f.assigned === 'unassigned') {
    appFilters.push(`a.assigned_user_id IS NULL`);
    // Unverified/pending premises are implicitly unassigned — include them
  }

  // --- application type slug ---
  if (f.typeSlug) {
    params.push(f.typeSlug);
    appFilters.push(`at.slug = $${params.length}`);
    // typeSlug doesn't apply to pv rows
    pvFilters.push(`FALSE`);
  }

  // --- created_days ---
  if (f.createdDays && f.createdDays > 0) {
    params.push(f.createdDays);
    appFilters.push(`a.created_at >= NOW() - ($${params.length} || ' days')::interval`);
    pvFilters.push(`p.created_at >= NOW() - ($${params.length} || ' days')::interval`);
  }

  const appWhere = appFilters.join(' AND ');
  const pvWhere  = pvFilters.join(' AND ');

  const rows = await sql(`
    SELECT
      'application'           AS case_type,
      a.id                    AS case_id,
      a.ref_number            AS ref_number,
      NULL::text              AS pv_ref,
      a.status                AS case_status,
      a.premises_name         AS premises_name,
      a.premises_postcode     AS premises_postcode,
      at.name                 AS type_name,
      at.slug                 AS type_slug,
      a.created_at            AS case_created_at,
      a.updated_at            AS case_updated_at,
      a.assigned_user_id      AS assigned_user_id,
      au.full_name            AS assigned_user_name,
      aa.full_name            AS applicant_name,
      aa.email                AS applicant_email,
      t.slug                  AS tenant_slug
    FROM applications a
    LEFT JOIN application_types at       ON at.id = a.application_type_id
    LEFT JOIN users au                   ON au.id = a.assigned_user_id
    LEFT JOIN applicant_accounts aa      ON aa.id = a.applicant_account_id
    INNER JOIN tenants t                 ON t.id  = a.tenant_id
    WHERE ${appWhere}

    UNION ALL

    SELECT
      'premises_verification' AS case_type,
      p.id                    AS case_id,
      NULL::bigint            AS ref_number,
      'PV-' || UPPER(SUBSTRING(p.id::text, 1, 8))  AS pv_ref,
      p.verification_state    AS case_status,
      p.premises_name         AS premises_name,
      p.postcode              AS premises_postcode,
      'Premises Verification' AS type_name,
      'premises_verification' AS type_slug,
      p.created_at            AS case_created_at,
      p.updated_at            AS case_updated_at,
      NULL::uuid              AS assigned_user_id,
      NULL::text              AS assigned_user_name,
      aa2.full_name           AS applicant_name,
      aa2.email               AS applicant_email,
      t2.slug                 AS tenant_slug
    FROM premises p
    LEFT JOIN applicant_accounts aa2 ON aa2.id = p.applicant_account_id
    INNER JOIN tenants t2            ON t2.id  = p.tenant_id
    WHERE ${pvWhere}

    ORDER BY ${orderBy}
  `, params);

  return json({ cases: rows });
}

// ---------------------------------------------------------------------------
// GET /api/admin/cases/stats
// ---------------------------------------------------------------------------
async function getCaseStats(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const tid = session.tenant_id;
  const uid = session.user_id;

  const [appRow, pvRow] = await Promise.all([
    sql`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE status = 'submitted')                     AS submitted,
        COUNT(*) FILTER (WHERE assigned_user_id = ${uid})               AS assigned_to_me,
        COUNT(*) FILTER (WHERE assigned_user_id IS NULL)                 AS unassigned,
        COUNT(*) FILTER (WHERE status = 'awaiting_information')          AS awaiting_information
      FROM applications
      WHERE tenant_id = ${tid}
        AND status <> 'draft'
    `,
    sql`
      SELECT
        COUNT(*)                                                                          AS total,
        COUNT(*) FILTER (WHERE verification_state = 'pending_verification')              AS pending,
        COUNT(*) FILTER (WHERE verification_state IN ('unverified','pending_verification')) AS needs_action
      FROM premises
      WHERE tenant_id = ${tid}
    `,
  ]);

  const a = appRow[0] ?? {};
  const pv = pvRow[0] ?? {};

  return json({
    stats: {
      applications: {
        total:                Number(a.total ?? 0),
        submitted:            Number(a.submitted ?? 0),
        assigned_to_me:       Number(a.assigned_to_me ?? 0),
        unassigned:           Number(a.unassigned ?? 0),
        awaiting_information: Number(a.awaiting_information ?? 0),
      },
      premises_verifications: {
        total:        Number(pv.total ?? 0),
        pending:      Number(pv.pending ?? 0),
        needs_action: Number(pv.needs_action ?? 0),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Saved filters
// ---------------------------------------------------------------------------

const ALLOWED_FILTER_KEYS = new Set([
  'status', 'assigned', 'case_type', 'type', 'created_days', 'sort',
]);

function sanitiseFilterJson(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_FILTER_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = v;
    }
  }
  return out;
}

async function listSavedFilters(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, name, filter_json, is_default, created_at, updated_at
    FROM saved_filters
    WHERE tenant_id = ${session.tenant_id}
      AND user_id = ${session.user_id}
    ORDER BY is_default DESC, updated_at DESC
  `;

  return json({ filters: rows });
}

async function createSavedFilter(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const name = body.name?.trim();
  if (!name) return error('name is required');
  if (name.length > 80) return error('name must be 80 characters or fewer');

  const filterJson = sanitiseFilterJson(body.filter_json);
  const isDefault = body.is_default === true;

  const sql = getDb(env);

  if (isDefault) {
    await sql`
      UPDATE saved_filters
      SET is_default = FALSE, updated_at = NOW()
      WHERE tenant_id = ${session.tenant_id}
        AND user_id = ${session.user_id}
        AND is_default = TRUE
    `;
  }

  const rows = await sql`
    INSERT INTO saved_filters (tenant_id, user_id, name, filter_json, is_default)
    VALUES (${session.tenant_id}, ${session.user_id}, ${name}, ${JSON.stringify(filterJson)}, ${isDefault})
    RETURNING id, name, filter_json, is_default, created_at, updated_at
  `;

  return json({ filter: rows[0] }, 201);
}

async function updateSavedFilter(request, env, filterId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const sql = getDb(env);
  const existing = (await sql`
    SELECT id FROM saved_filters
    WHERE id = ${filterId} AND tenant_id = ${session.tenant_id} AND user_id = ${session.user_id}
    LIMIT 1
  `)[0];
  if (!existing) return error('Filter not found', 404);

  const name = body.name?.trim();
  if (name !== undefined && name.length > 80) return error('name must be 80 characters or fewer');

  const filterJson = body.filter_json !== undefined ? sanitiseFilterJson(body.filter_json) : undefined;
  const isDefault = body.is_default;

  if (isDefault === true) {
    await sql`
      UPDATE saved_filters
      SET is_default = FALSE, updated_at = NOW()
      WHERE tenant_id = ${session.tenant_id}
        AND user_id = ${session.user_id}
        AND is_default = TRUE
        AND id <> ${filterId}
    `;
  }

  if (name !== undefined) {
    await sql`UPDATE saved_filters SET name = ${name}, updated_at = NOW() WHERE id = ${filterId}`;
  }
  if (filterJson !== undefined) {
    await sql`UPDATE saved_filters SET filter_json = ${JSON.stringify(filterJson)}, updated_at = NOW() WHERE id = ${filterId}`;
  }
  if (isDefault !== undefined) {
    await sql`UPDATE saved_filters SET is_default = ${isDefault}, updated_at = NOW() WHERE id = ${filterId}`;
  }

  const rows = await sql`
    SELECT id, name, filter_json, is_default, created_at, updated_at
    FROM saved_filters WHERE id = ${filterId}
  `;
  return json({ filter: rows[0] });
}

async function deleteSavedFilter(request, env, filterId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const result = await sql`
    DELETE FROM saved_filters
    WHERE id = ${filterId}
      AND tenant_id = ${session.tenant_id}
      AND user_id = ${session.user_id}
    RETURNING id
  `;
  if (result.length === 0) return error('Filter not found', 404);

  return json({ deleted: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleAdminCaseRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/admin/cases') {
    return listCases(request, env);
  }

  if (method === 'GET' && url.pathname === '/api/admin/cases/stats') {
    return getCaseStats(request, env);
  }

  if (method === 'GET' && url.pathname === '/api/admin/saved-filters') {
    return listSavedFilters(request, env);
  }

  if (method === 'POST' && url.pathname === '/api/admin/saved-filters') {
    return createSavedFilter(request, env);
  }

  const filterMatch = url.pathname.match(/^\/api\/admin\/saved-filters\/([^/]+)$/);
  if (filterMatch) {
    if (method === 'PUT')    return updateSavedFilter(request, env, filterMatch[1]);
    if (method === 'DELETE') return deleteSavedFilter(request, env, filterMatch[1]);
  }

  return null;
}
