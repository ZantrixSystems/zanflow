/**
 * Platform public routes.
 *
 * These routes are for zanflo.com itself, not tenant portals.
 * They support self-serve creation of the initial tenant admin account.
 */

import { getDb } from '../db/client.js';
import { writeAuditLog } from '../lib/audit.js';
import { hashPassword } from '../lib/passwords.js';
import { validateSubdomain } from '../lib/subdomains.js';
import { validateUsername } from '../lib/usernames.js';
import { signSession, buildCookie } from '../lib/session.js';

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
]);

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

function isWorkEmail(email) {
  const [, domain] = email.split('@');
  if (!domain) return false;
  return !PERSONAL_EMAIL_DOMAINS.has(domain);
}

async function createTenantBootstrap(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const organisationName = body.organisation_name?.trim() ?? '';
  const adminName = body.admin_name?.trim() ?? '';
  const workEmail = normaliseEmail(body.work_email);
  const requestedSubdomain = body.requested_subdomain?.trim().toLowerCase() ?? '';
  const username = body.username?.trim() ?? '';
  const password = body.password ?? '';

  if (!organisationName) return error('organisation_name is required');
  if (!adminName) return error('admin_name is required');
  if (!workEmail) return error('work_email is required');
  if (!workEmail.includes('@')) return error('work_email must be a valid email address');
  if (!isWorkEmail(workEmail)) return error('Please use a work email address');
  if (password.length < 8) return error('Password must be at least 8 characters');

  const subdomainError = validateSubdomain(requestedSubdomain);
  if (subdomainError) return error(subdomainError);

  const usernameError = validateUsername(username);
  if (usernameError) return error(usernameError);

  const sql = getDb(env);

  const tenantClash = await sql`
    SELECT id
    FROM tenants
    WHERE slug = ${requestedSubdomain}
       OR subdomain = ${requestedSubdomain}
    LIMIT 1
  `;
  if (tenantClash.length > 0) return error('requested subdomain is already in use', 409);

  const emailClash = await sql`
    SELECT id
    FROM users
    WHERE email = ${workEmail}
    LIMIT 1
  `;
  if (emailClash.length > 0) return error('A user with this email already exists', 409);

  const usernameClash = await sql`
    SELECT id
    FROM users
    WHERE LOWER(username) = ${username.toLowerCase()}
    LIMIT 1
  `;
  if (usernameClash.length > 0) return error('That username is already in use', 409);

  const passwordHash = await hashPassword(password);

  const tenantRows = await sql`
    INSERT INTO tenants (
      name,
      slug,
      subdomain,
      status,
      contact_name,
      contact_email,
      activation_expires_at
    )
    VALUES (
      ${organisationName},
      ${requestedSubdomain},
      ${requestedSubdomain},
      'pending_verification',
      ${adminName},
      ${workEmail},
      NOW() + INTERVAL '30 days'
    )
    RETURNING id, name, slug, subdomain, status, activation_expires_at, created_at
  `;
  const tenant = tenantRows[0];

  const userRows = await sql`
    INSERT INTO users (email, username, password_hash, full_name, is_platform_admin)
    VALUES (${workEmail}, ${username}, ${passwordHash}, ${adminName}, false)
    RETURNING id, email, username, full_name, is_platform_admin
  `;
  const user = userRows[0];

  await sql`
    INSERT INTO memberships (tenant_id, user_id, role)
    VALUES (${tenant.id}, ${user.id}, 'tenant_admin')
  `;

  await sql`
    INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
    VALUES (${tenant.id}, 3, 50)
  `;

  await sql`
    INSERT INTO tenant_role_assignments (tenant_id, email, role, status, created_by_user_id)
    VALUES (${tenant.id}, ${workEmail}, 'tenant_admin', 'active', ${user.id})
  `;

  await sql`
    INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
    SELECT ${tenant.id}, at.id
    FROM application_types at
    WHERE at.is_active = true
    ON CONFLICT (tenant_id, application_type_id) DO NOTHING
  `;

  await writeAuditLog(sql, {
    tenantId: null,
    actorType: 'system',
    actorId: null,
    action: 'tenant.self_serve_signup.created',
    recordType: 'tenant',
    recordId: tenant.id,
    meta: {
      organisation_name: tenant.name,
      requested_subdomain: tenant.subdomain,
      work_email: user.email,
      username: user.username,
      initial_role: 'tenant_admin',
    },
  });

  const token = await signSession({
    user_id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    is_platform_admin: false,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    role: 'tenant_admin',
  }, env.JWT_SECRET);

  return json({
    tenant,
    user,
    message: 'Admin account created. Continue with tenant setup.',
  }, 201, {
    'Set-Cookie': buildCookie(token),
  });
}

export async function handlePlatformPublicRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/platform/signup') {
    return createTenantBootstrap(request, env);
  }

  return null;
}
