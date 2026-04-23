import { getDb } from '../db/client.js';
import { hashBootstrapToken } from '../lib/bootstrap-tokens.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireStaff } from '../lib/guards.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { validateBootstrapPassword } from '../lib/password-policy.js';
import { isPlatformHost } from '../lib/request-context.js';
import { buildCookie, clearCookie, signSession } from '../lib/session.js';
import { resolveTenant } from '../lib/tenant-resolver.js';
import { checkLoginRateLimit, recordFailedLogin, clearEmailRateLimit, getClientIp } from '../lib/rate-limit.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function login(request, env) {
  if (isPlatformHost(request)) return error('Not found', 404);

  const sql = getDb(env);
  const tenant = await resolveTenant(request, sql, env);
  if (!tenant) return error('Tenant not found or not available', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const identifier = body.identifier?.trim() || body.email?.trim() || '';
  const { password } = body;
  if (!identifier || !password) {
    return error('Email address and password are required');
  }

  const ip = getClientIp(request);
  const normIdentifier = identifier.toLowerCase();

  const { limited, reason } = await checkLoginRateLimit(env.RATE_LIMIT, ip, normIdentifier, 'staff');
  if (limited) return error(reason, 429);

  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.username,
      u.full_name,
      u.password_hash,
      u.is_platform_admin,
      m.role,
      m.tenant_id
    FROM memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenant.id}
      AND (
        u.email = ${normIdentifier}
        OR LOWER(COALESCE(u.username, '')) = ${normIdentifier}
      )
    LIMIT 1
  `;

  if (rows.length === 0) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normIdentifier, 'staff');
    return error('Invalid credentials', 401);
  }
  const user = rows[0];

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normIdentifier, 'staff');
    return error('Invalid credentials', 401);
  }

  await clearEmailRateLimit(env.RATE_LIMIT, normIdentifier, 'staff');

  const token = await signSession({
    user_id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    is_platform_admin: user.is_platform_admin,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    role: user.role,
  }, env.JWT_SECRET);

  return json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      is_platform_admin: user.is_platform_admin,
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
    },
    role: user.role,
  }, 200, {
    'Set-Cookie': buildCookie(token),
  });
}

async function bootstrapExchange(request, env) {
  if (isPlatformHost(request)) return error('Not found', 404);

  const sql = getDb(env);
  const tenant = await resolveTenant(request, sql, env);
  if (!tenant) return error('Tenant not found or not available', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const rawToken = body.token?.trim() || '';
  if (!rawToken) return error('Sign-in token is required.');

  const tokenHash = await hashBootstrapToken(rawToken);
  const rows = await sql`
    SELECT
      tbt.id,
      tbt.user_id,
      u.email,
      u.username,
      u.full_name,
      u.is_platform_admin,
      m.role
    FROM tenant_bootstrap_tokens tbt
    INNER JOIN users u ON u.id = tbt.user_id
    INNER JOIN memberships m
      ON m.user_id = u.id
     AND m.tenant_id = tbt.tenant_id
    WHERE tbt.token_hash = ${tokenHash}
      AND tbt.tenant_id = ${tenant.id}
      AND tbt.purpose = 'tenant_admin_bootstrap'
      AND tbt.used_at IS NULL
      AND tbt.expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) return error('Sign-in link is invalid or has expired.', 401);
  const bootstrap = rows[0];

  await sql`
    UPDATE tenant_bootstrap_tokens
    SET used_at = NOW()
    WHERE id = ${bootstrap.id}
      AND used_at IS NULL
  `;

  const token = await signSession({
    user_id: bootstrap.user_id,
    email: bootstrap.email,
    username: bootstrap.username,
    full_name: bootstrap.full_name,
    is_platform_admin: bootstrap.is_platform_admin,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    role: bootstrap.role,
  }, env.JWT_SECRET);

  await writeAuditLog(sql, {
    tenantId: tenant.id,
    actorType: bootstrap.role,
    actorId: bootstrap.user_id,
    action: 'tenant_admin.bootstrap_sign_in',
    recordType: 'tenant_bootstrap_token',
    recordId: bootstrap.id,
    meta: { tenant_slug: tenant.slug },
  });

  return json({
    tenant_name: tenant.name,
    session: {
      user_id: bootstrap.user_id,
      email: bootstrap.email,
      username: bootstrap.username,
      full_name: bootstrap.full_name,
      is_platform_admin: bootstrap.is_platform_admin,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      role: bootstrap.role,
    },
  }, 200, {
    'Set-Cookie': buildCookie(token),
  });
}

async function logout(request) {
  if (isPlatformHost(request)) return error('Not found', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
    },
  });
}

async function me(request, env) {
  if (isPlatformHost(request)) return error('Not found', 404);

  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  // Load custom role permissions if the member has one assigned
  const sql = getDb(env);
  const membershipRows = await sql`
    SELECT custom_role_id
    FROM memberships
    WHERE tenant_id = ${session.tenant_id}
      AND user_id = ${session.user_id}
    LIMIT 1
  `;
  const customRoleId = membershipRows[0]?.custom_role_id ?? null;

  let permissions = null;
  if (customRoleId) {
    const permRows = await sql`
      SELECT permission_key
      FROM custom_role_permissions
      WHERE role_id = ${customRoleId}
        AND role_id IN (
          SELECT id FROM custom_roles WHERE tenant_id = ${session.tenant_id}
        )
    `;
    permissions = permRows.map((r) => r.permission_key);
  }

  return json({
    session: {
      ...session,
      custom_role_id: customRoleId,
      permissions,
    },
  });
}

async function getProfile(request, env) {
  if (isPlatformHost(request)) return error('Not found', 404);

  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);
  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.username,
      (u.password_hash IS NOT NULL) AS has_password,
      t.name AS tenant_name,
      t.subdomain AS tenant_subdomain
    FROM users u
    INNER JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${session.tenant_id}
    INNER JOIN tenants t ON t.id = ${session.tenant_id}
    WHERE u.id = ${session.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return error('User not found', 404);

  return json({
    profile: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      username: user.username,
      role: session.role,
      has_password: user.has_password,
      tenant_name: user.tenant_name,
      tenant_subdomain: user.tenant_subdomain,
    },
  });
}

async function updateProfile(request, env) {
  if (isPlatformHost(request)) return error('Not found', 404);

  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, full_name, email, password_hash
    FROM users
    WHERE id = ${session.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return error('User not found', 404);
  if (!user.password_hash) return error('SSO-managed accounts cannot be edited here.', 403);

  const newName = body.full_name?.trim() || '';
  if (!newName) return error('Full name is required.');

  if (body.new_password) {
    if (!body.current_password) return error('Current password is required to change password.');
    const valid = await verifyPassword(body.current_password, user.password_hash);
    if (!valid) return error('Current password is incorrect.', 401);
    if (body.new_password !== body.new_password_confirmation) {
      return error('Password confirmation does not match.');
    }
    const passwordError = validateBootstrapPassword(body.new_password);
    if (passwordError) return error(passwordError);

    const newHash = await hashPassword(body.new_password);
    await sql`
      UPDATE users
      SET full_name = ${newName}, password_hash = ${newHash}, updated_at = NOW()
      WHERE id = ${session.user_id}
    `;
  } else {
    await sql`
      UPDATE users
      SET full_name = ${newName}, updated_at = NOW()
      WHERE id = ${session.user_id}
    `;
  }

  const newToken = await signSession({ ...session, full_name: newName }, env.JWT_SECRET);

  return json({ ok: true, full_name: newName }, 200, {
    'Set-Cookie': buildCookie(newToken),
  });
}

export async function handleStaffAuthRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/staff/login') return login(request, env);
  if (method === 'POST' && url.pathname === '/api/staff/bootstrap-exchange') return bootstrapExchange(request, env);
  if (method === 'POST' && url.pathname === '/api/staff/logout') return logout(request);
  if (method === 'GET' && url.pathname === '/api/staff/me') return me(request, env);
  if (method === 'GET' && url.pathname === '/api/staff/profile') return getProfile(request, env);
  if (method === 'PUT' && url.pathname === '/api/staff/profile') return updateProfile(request, env);

  return null;
}
