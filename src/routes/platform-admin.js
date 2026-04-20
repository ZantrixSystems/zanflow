/**
 * Platform admin routes — internal only.
 *
 * These routes are for platform-level administration. They are NOT
 * tenant-scoped and require is_platform_admin = true on the staff session.
 *
 * All mutations are audited. Tenant isolation does not apply here —
 * these endpoints operate across tenants by design.
 *
 * Routes:
 *   GET  /api/platform/tenants                    — list all tenants
 *   POST /api/platform/tenants                    — create a new tenant
 *   GET  /api/platform/tenants/:id                — get one tenant
 *   PUT  /api/platform/tenants/:id/status         — update tenant status
 *   POST /api/platform/tenants/:id/admin          — create first tenant admin user
 *
 * Subdomain validation:
 *   lowercase alphanumeric + hyphens, 2-63 chars, not in reserved list.
 *   Must be unique across tenants.
 */

import { getDb }        from '../db/client.js';
import { requirePlatformAdmin } from '../lib/guards.js';
import { hashPassword } from '../lib/passwords.js';
import { isPlatformHost } from '../lib/request-context.js';
import { writeAuditLog } from '../lib/audit.js';
import { validateSubdomain } from '../lib/subdomains.js';
import { handleCouncilLookup } from '../lib/council-lookup.js';

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

const VALID_STATUSES = new Set([
  'pending_setup', 'active', 'suspended', 'disabled',
]);

// ---------------------------------------------------------------------------
// GET /api/platform/tenants
// ---------------------------------------------------------------------------
async function listTenants(request, env) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      t.id, t.name, t.slug, t.subdomain, t.status,
      t.contact_name, t.contact_email,
      t.trial_ends_at, t.activated_at, t.created_at,
      tl.max_staff_users, tl.max_applications,
      ts.bootstrap_admin_user_id,
      bu.full_name AS bootstrap_owner_name,
      bu.email AS bootstrap_owner_email,
      (SELECT COUNT(*)::int FROM memberships m WHERE m.tenant_id = t.id) AS staff_count
    FROM tenants t
    LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
    LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
    LEFT JOIN users bu ON bu.id = ts.bootstrap_admin_user_id
    ORDER BY t.created_at DESC
  `;

  return json({ tenants: rows });
}

// ---------------------------------------------------------------------------
// POST /api/platform/tenants
// Create a new tenant. Does not provision a user — use the /admin endpoint.
// ---------------------------------------------------------------------------
async function createTenant(request, env) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON body'); }

  const {
    name,
    slug,
    subdomain,
    status = 'pending_setup',
    contact_name,
    contact_email,
    max_staff_users = 3,
    max_applications = 50,
  } = body;

  if (!name?.trim())  return error('name is required');
  if (!slug?.trim())  return error('slug is required');

  // slug: same format as subdomain
  if (!/^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]$/.test(slug)) {
    return error('slug must be lowercase alphanumeric + hyphens');
  }

  const subdomainError = validateSubdomain(subdomain?.trim());
  if (subdomainError) return error(subdomainError);

  if (!VALID_STATUSES.has(status)) return error('Invalid status');

  const sql = getDb(env);

  // Check uniqueness
  const clash = await sql`
    SELECT id FROM tenants WHERE slug = ${slug} OR subdomain = ${subdomain}
  `;
  if (clash.length > 0) return error('slug or subdomain already in use', 409);

  const rows = await sql`
    INSERT INTO tenants (name, slug, subdomain, status, contact_name, contact_email, trial_ends_at)
    VALUES (
      ${name.trim()},
      ${slug.trim()},
      ${subdomain.trim()},
      ${status},
      ${contact_name?.trim() ?? null},
      ${contact_email?.trim().toLowerCase() ?? null},
      NULL
    )
    RETURNING id, name, slug, subdomain, status, created_at
  `;

  const tenant = rows[0];

  // Create limits record
  await sql`
    INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
    VALUES (${tenant.id}, ${max_staff_users}, ${max_applications})
  `;

  await sql`
    INSERT INTO tenant_settings (
      tenant_id,
      council_display_name,
      support_contact_name,
      support_email,
      internal_admin_email,
      welcome_text,
      public_homepage_text,
      contact_us_text
    )
    VALUES (
      ${tenant.id},
      ${tenant.name},
      ${contact_name?.trim() ?? null},
      ${contact_email?.trim().toLowerCase() ?? null},
      ${contact_email?.trim().toLowerCase() ?? null},
      ${`Welcome to ${tenant.name}'s licensing service.`},
      'Create an applicant account to start a premises licence application online.',
      'Use the support details above if you need help with this service.'
    )
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  await sql`
    INSERT INTO tenant_sso_configs (tenant_id)
    VALUES (${tenant.id})
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  await writeAuditLog(sql, {
    tenantId:   null,
    actorType:  'platform_admin',
    actorId:    session.user_id,
    action:     'tenant.created',
    recordType: 'tenant',
    recordId:   tenant.id,
    meta:       { name: tenant.name, slug: tenant.slug, subdomain: tenant.subdomain, status },
  });

  return json(tenant, 201);
}

// ---------------------------------------------------------------------------
// GET /api/platform/tenants/:id
// ---------------------------------------------------------------------------
async function getTenant(request, env, id) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const rows = await sql`
    SELECT
      t.*,
      ts.bootstrap_admin_user_id,
      bu.full_name AS bootstrap_owner_name,
      bu.email AS bootstrap_owner_email,
      tl.max_staff_users, tl.max_applications
    FROM tenants t
    LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
    LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
    LEFT JOIN users bu ON bu.id = ts.bootstrap_admin_user_id
    WHERE t.id = ${id}
  `;

  if (rows.length === 0) return error('Tenant not found', 404);
  return json(rows[0]);
}

// ---------------------------------------------------------------------------
// PUT /api/platform/tenants/:id/status
// Update tenant status. Records a timestamp for lifecycle transitions.
// ---------------------------------------------------------------------------
async function updateTenantStatus(request, env, id) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON body'); }

  const { status } = body;
  if (!status) return error('status is required');
  if (!VALID_STATUSES.has(status)) return error('Invalid status');

  const sql = getDb(env);

  // Stamp the appropriate lifecycle timestamp
  const now = new Date().toISOString();
  const rows = await sql`
    UPDATE tenants
    SET
      status             = ${status},
      activated_at       = CASE WHEN ${status} = 'active'      THEN ${now}::timestamptz ELSE activated_at END,
      suspended_at       = CASE WHEN ${status} = 'suspended'   THEN ${now}::timestamptz ELSE suspended_at END,
      deleted_at         = CASE WHEN ${status} = 'disabled'    THEN ${now}::timestamptz ELSE deleted_at   END
    WHERE id = ${id}
    RETURNING id, name, slug, subdomain, status
  `;

  if (rows.length === 0) return error('Tenant not found', 404);

  await writeAuditLog(sql, {
    tenantId:   id,
    actorType:  'platform_admin',
    actorId:    session.user_id,
    action:     'tenant.status_changed',
    recordType: 'tenant',
    recordId:   id,
    meta:       { new_status: status },
  });

  return json(rows[0]);
}

// ---------------------------------------------------------------------------
// POST /api/platform/tenants/:id/admin
// Create the first tenant admin user for a tenant.
// Does not require the user to exist — creates a new staff user + membership.
// ---------------------------------------------------------------------------
async function createTenantAdmin(request, env, id) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON body'); }

  const { email, full_name, password } = body;

  if (!email?.trim())     return error('email is required');
  if (!full_name?.trim()) return error('full_name is required');
  if (!password)          return error('password is required');
  if (password.length < 12) return error('password must be at least 12 characters');
  if (!email.includes('@')) return error('Invalid email address');

  const sql = getDb(env);

  // Confirm tenant exists
  const tenantRows = await sql`SELECT id, name, status FROM tenants WHERE id = ${id}`;
  if (tenantRows.length === 0) return error('Tenant not found', 404);

  // Check email not already taken
  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
  if (existing.length > 0) return error('A user with this email already exists', 409);

  // Check staff user limit for this tenant
  const limitRows = await sql`
    SELECT tl.max_staff_users, COUNT(m.id)::int AS current_count
    FROM tenant_limits tl
    LEFT JOIN memberships m ON m.tenant_id = ${id}
    WHERE tl.tenant_id = ${id}
    GROUP BY tl.max_staff_users
  `;
  if (limitRows.length > 0 && limitRows[0].current_count >= limitRows[0].max_staff_users) {
    return error('Staff user limit reached for this tenant', 403);
  }

  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.toLowerCase().trim();

  const userRows = await sql`
    INSERT INTO users (email, username, password_hash, full_name, is_platform_admin)
    VALUES (${normalizedEmail}, ${normalizedEmail}, ${passwordHash}, ${full_name.trim()}, false)
    RETURNING id, email, username, full_name
  `;
  const user = userRows[0];

  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${id}, ${user.id}, 'tenant_admin')
  `;

  await sql`
    INSERT INTO tenant_settings (
      tenant_id,
      bootstrap_admin_user_id,
      council_display_name,
      support_email,
      support_contact_name,
      internal_admin_name,
      internal_admin_email,
      welcome_text,
      public_homepage_text,
      contact_us_text
    )
    SELECT
      t.id,
      ${user.id},
      t.name,
      COALESCE(t.contact_email, ${user.email}),
      COALESCE(t.contact_name, ${full_name.trim()}),
      ${full_name.trim()},
      ${user.email},
      ${`Welcome to ${tenantRows[0].name}'s licensing service.`},
      'Create an applicant account to start a premises licence application online.',
      'Use the support details above if you need help with this service.'
    FROM tenants t
    WHERE t.id = ${id}
    ON CONFLICT (tenant_id) DO UPDATE
    SET
      bootstrap_admin_user_id = COALESCE(tenant_settings.bootstrap_admin_user_id, EXCLUDED.bootstrap_admin_user_id),
      support_email = COALESCE(tenant_settings.support_email, EXCLUDED.support_email),
      support_contact_name = COALESCE(tenant_settings.support_contact_name, EXCLUDED.support_contact_name),
      internal_admin_name = COALESCE(tenant_settings.internal_admin_name, EXCLUDED.internal_admin_name),
      internal_admin_email = COALESCE(tenant_settings.internal_admin_email, EXCLUDED.internal_admin_email),
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO tenant_sso_configs (tenant_id)
    VALUES (${id})
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  await writeAuditLog(sql, {
    tenantId:   id,
    actorType:  'platform_admin',
    actorId:    session.user_id,
    action:     'tenant_admin.created',
    recordType: 'user',
    recordId:   user.id,
    meta:       { email: user.email, tenant_id: id },
  });

  return json({ user: { id: user.id, email: user.email, full_name: user.full_name }, role: 'tenant_admin' }, 201);
}

// ---------------------------------------------------------------------------
// GET /api/platform/council-lookup?postcode=
// Platform-admin-authenticated proxy to the GOV.UK Local Authorities API.
// Logic lives in src/lib/council-lookup.js (shared with the public endpoint).
// ---------------------------------------------------------------------------
async function councilLookup(request, env) {
  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authorised', 403);
  const postcode = new URL(request.url).searchParams.get('postcode');
  return handleCouncilLookup(postcode);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handlePlatformAdminRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (!url.pathname.startsWith('/api/platform/')) return null;
  if (!isPlatformHost(request)) return error('Not found', 404);

  if (method === 'GET'  && url.pathname === '/api/platform/council-lookup') return councilLookup(request, env);
  if (method === 'GET'  && url.pathname === '/api/platform/tenants') return listTenants(request, env);
  if (method === 'POST' && url.pathname === '/api/platform/tenants') return createTenant(request, env);

  const tenantMatch = url.pathname.match(/^\/api\/platform\/tenants\/([^/]+)$/);
  if (tenantMatch) {
    if (method === 'GET') return getTenant(request, env, tenantMatch[1]);
  }

  const statusMatch = url.pathname.match(/^\/api\/platform\/tenants\/([^/]+)\/status$/);
  if (statusMatch && method === 'PUT') return updateTenantStatus(request, env, statusMatch[1]);

  const adminMatch = url.pathname.match(/^\/api\/platform\/tenants\/([^/]+)\/admin$/);
  if (adminMatch && method === 'POST') return createTenantAdmin(request, env, adminMatch[1]);

  return null;
}
