import { getDb } from '../db/client.js';
import { getCookieValue, verifySession } from '../lib/session.js';
import { writeAuditLog } from '../lib/audit.js';

const VALID_ASSIGNMENT_ROLES = new Set(['tenant_admin', 'manager', 'officer']);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function normaliseEmail(value) {
  return value?.trim().toLowerCase() ?? '';
}

async function requireTenantAdminSession(request, env) {
  const token = getCookieValue(request, 'session');
  if (!token) return null;
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return null;
  if (!session.tenant_id || session.role !== 'tenant_admin') return null;
  return session;
}

function buildDaysRemaining(activationExpiresAt) {
  if (!activationExpiresAt) return null;
  const diffMs = new Date(activationExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

async function getBootstrapMe(request, env) {
  const session = await requireTenantAdminSession(request, env);
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const tenants = await sql`
    SELECT
      t.id,
      t.name,
      t.slug,
      t.subdomain,
      t.status,
      t.contact_name,
      t.contact_email,
      t.activation_expires_at,
      t.onboarding_completed_at,
      t.trial_started_at,
      t.trial_ends_at,
      t.created_at,
      tl.max_staff_users,
      tl.max_applications
    FROM tenants t
    LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
    WHERE t.id = ${session.tenant_id}
    LIMIT 1
  `;
  const tenant = tenants[0];
  if (!tenant) return error('Tenant not found', 404);

  const staffMembers = await sql`
    SELECT
      u.id,
      u.email,
      u.username,
      u.full_name,
      m.role,
      m.created_at
    FROM memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenant.id}
    ORDER BY
      CASE m.role
        WHEN 'tenant_admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'officer' THEN 3
        ELSE 9
      END,
      u.full_name ASC
  `;

  const roleAssignments = await sql`
    SELECT id, email, role, status, created_at, updated_at
    FROM tenant_role_assignments
    WHERE tenant_id = ${tenant.id}
    ORDER BY
      CASE role
        WHEN 'tenant_admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'officer' THEN 3
        ELSE 9
      END,
      email ASC
  `;

  return json({
    session,
    tenant: {
      ...tenant,
      activation_days_remaining: buildDaysRemaining(tenant.activation_expires_at),
    },
    staff_members: staffMembers,
    role_assignments: roleAssignments,
  });
}

async function saveRoleAssignments(request, env) {
  const session = await requireTenantAdminSession(request, env);
  if (!session) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const roles = Array.isArray(body.roles) ? body.roles : null;
  if (!roles) return error('roles array is required');

  const sql = getDb(env);
  const seenEmails = new Map();

  for (const entry of roles) {
    if (!VALID_ASSIGNMENT_ROLES.has(entry?.role)) {
      return error('Invalid role');
    }

    const emails = Array.isArray(entry?.emails) ? entry.emails : [];
    for (const rawEmail of emails) {
      const email = normaliseEmail(rawEmail);
      if (!email) continue;
      if (!email.includes('@')) {
        return error(`Invalid email address in ${entry.role}`);
      }
      const existingRole = seenEmails.get(email);
      if (existingRole && existingRole !== entry.role) {
        return error(`Email ${email} is assigned to more than one role`);
      }
      seenEmails.set(email, entry.role);
    }
  }

  await sql`
    DELETE FROM tenant_role_assignments
    WHERE tenant_id = ${session.tenant_id}
      AND created_by_user_id = ${session.user_id}
      AND email <> ${session.email}
  `;

  for (const [email, role] of seenEmails.entries()) {
    await sql`
      INSERT INTO tenant_role_assignments (
        tenant_id,
        email,
        role,
        status,
        created_by_user_id,
        updated_at
      )
      VALUES (
        ${session.tenant_id},
        ${email},
        ${role},
        ${email === session.email ? 'active' : 'pending'},
        ${session.user_id},
        NOW()
      )
      ON CONFLICT (tenant_id, email) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          created_by_user_id = EXCLUDED.created_by_user_id,
          updated_at = NOW()
    `;
  }

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: 'tenant_admin',
    actorId: session.user_id,
    action: 'tenant.bootstrap.role_assignments.saved',
    recordType: 'tenant',
    recordId: session.tenant_id,
    meta: {
      assignments: Array.from(seenEmails.entries()).map(([email, role]) => ({ email, role })),
    },
  });

  return getBootstrapMe(request, env);
}

async function activateBootstrapTenant(request, env) {
  const session = await requireTenantAdminSession(request, env);
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);

  const tenants = await sql`
    SELECT id, status
    FROM tenants
    WHERE id = ${session.tenant_id}
    LIMIT 1
  `;
  const tenant = tenants[0];
  if (!tenant) return error('Tenant not found', 404);
  if (tenant.status !== 'pending_verification') {
    return error('Tenant is not awaiting activation', 409);
  }

  await sql`
    UPDATE tenants
    SET status = 'trial',
        trial_started_at = NOW(),
        trial_ends_at = NOW() + INTERVAL '30 days',
        onboarding_completed_at = NOW(),
        activation_expires_at = NULL
    WHERE id = ${session.tenant_id}
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: 'tenant_admin',
    actorId: session.user_id,
    action: 'tenant.bootstrap.activated',
    recordType: 'tenant',
    recordId: session.tenant_id,
  });

  return getBootstrapMe(request, env);
}

export async function handlePlatformBootstrapRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/platform/bootstrap/me') {
    return getBootstrapMe(request, env);
  }

  if (method === 'PUT' && url.pathname === '/api/platform/bootstrap/role-assignments') {
    return saveRoleAssignments(request, env);
  }

  if (method === 'POST' && url.pathname === '/api/platform/bootstrap/activate') {
    return activateBootstrapTenant(request, env);
  }

  return null;
}
