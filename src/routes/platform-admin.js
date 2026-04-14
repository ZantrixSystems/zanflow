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
import { getCookieValue, verifySession } from '../lib/session.js';
import { hashPassword } from '../lib/passwords.js';
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

/**
 * Require a valid platform admin session.
 * Returns the session payload or null.
 */
async function requirePlatformAdmin(request, env) {
  const token = getCookieValue(request, 'session');
  if (!token) return null;
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return null;
  if (!session.is_platform_admin) return null;
  return session;
}

// Reserved subdomains — must match tenant-resolver.js
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'platform', 'app', 'mail', 'smtp',
  'assets', 'static', 'cdn', 'status', 'login', 'auth',
  'billing', 'staging', 'dev', 'test', 'sandbox', 'demo',
]);

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]$/;

function validateSubdomain(subdomain) {
  if (!subdomain) return 'subdomain is required';
  if (!SUBDOMAIN_RE.test(subdomain)) return 'subdomain must be 2-63 lowercase alphanumeric characters or hyphens';
  if (RESERVED_SUBDOMAINS.has(subdomain)) return `'${subdomain}' is a reserved subdomain`;
  return null;
}

const VALID_STATUSES = new Set([
  'pending_verification', 'trial', 'active', 'suspended', 'expired', 'scheduled_deletion', 'deleted',
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
      (SELECT COUNT(*)::int FROM memberships m WHERE m.tenant_id = t.id) AS staff_count
    FROM tenants t
    LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
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
    status = 'trial',
    contact_name,
    contact_email,
    max_staff_users = 3,
    max_applications = 50,
    trial_days = 30,
  } = body;

  if (!name?.trim())  return error('name is required');
  if (!slug?.trim())  return error('slug is required');

  // slug: same format as subdomain
  if (!/^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]$/.test(slug)) {
    return error('slug must be lowercase alphanumeric + hyphens');
  }

  const subdomainError = validateSubdomain(subdomain);
  if (subdomainError) return error(subdomainError);

  if (!VALID_STATUSES.has(status)) return error('Invalid status');

  const sql = getDb(env);

  // Check uniqueness
  const clash = await sql`
    SELECT id FROM tenants WHERE slug = ${slug} OR subdomain = ${subdomain}
  `;
  if (clash.length > 0) return error('slug or subdomain already in use', 409);

  const trialEndsAt = (status === 'trial')
    ? sql`NOW() + (${trial_days} || ' days')::interval`
    : null;

  const rows = await sql`
    INSERT INTO tenants (name, slug, subdomain, status, contact_name, contact_email, trial_ends_at)
    VALUES (
      ${name.trim()},
      ${slug.trim()},
      ${subdomain.trim()},
      ${status},
      ${contact_name?.trim() ?? null},
      ${contact_email?.trim().toLowerCase() ?? null},
      ${trialEndsAt}
    )
    RETURNING id, name, slug, subdomain, status, created_at
  `;

  const tenant = rows[0];

  // Create limits record
  await sql`
    INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
    VALUES (${tenant.id}, ${max_staff_users}, ${max_applications})
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
      tl.max_staff_users, tl.max_applications
    FROM tenants t
    LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
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
      activated_at       = CASE WHEN ${status} = 'active'              THEN ${now}::timestamptz ELSE activated_at       END,
      suspended_at       = CASE WHEN ${status} = 'suspended'           THEN ${now}::timestamptz ELSE suspended_at       END,
      expired_at         = CASE WHEN ${status} = 'expired'             THEN ${now}::timestamptz ELSE expired_at         END,
      scheduled_deletion_at = CASE WHEN ${status} = 'scheduled_deletion' THEN ${now}::timestamptz ELSE scheduled_deletion_at END,
      deleted_at         = CASE WHEN ${status} = 'deleted'             THEN ${now}::timestamptz ELSE deleted_at         END
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

  const userRows = await sql`
    INSERT INTO users (email, password_hash, full_name, is_platform_admin)
    VALUES (${email.toLowerCase().trim()}, ${passwordHash}, ${full_name.trim()}, false)
    RETURNING id, email, full_name
  `;
  const user = userRows[0];

  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${id}, ${user.id}, 'tenant_admin')
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
// Router
// ---------------------------------------------------------------------------
export async function handlePlatformAdminRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (!url.pathname.startsWith('/api/platform/')) return null;

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
