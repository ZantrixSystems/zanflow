/**
 * Applicant auth routes.
 *
 * These are SEPARATE from staff auth (/auth/*).
 * Applicants are public users — different identity store (applicant_accounts),
 * different session cookie, different trust level.
 *
 * Routes:
 *   POST /applicant/register
 *   POST /applicant/login
 *   POST /applicant/logout
 *   GET  /applicant/me
 *
 * Tenant resolution:
 *   Delegated to src/lib/tenant-resolver.js — dual-mode.
 *   Production: resolved from subdomain in Host header.
 *   Dev/workers.dev fallback: resolved from X-Tenant-Slug header.
 *   See tenant-resolver.js for removal instructions when on real domain.
 */

import { getDb } from '../db/client.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  signApplicantSession,
  buildApplicantCookie,
  clearApplicantCookie,
} from '../lib/applicant-session.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireApplicant } from '../lib/guards.js';
import { resolveTenant } from '../lib/tenant-resolver.js';
import { checkLoginRateLimit, recordFailedLogin, clearEmailRateLimit, getClientIp } from '../lib/rate-limit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// ---------------------------------------------------------------------------
// POST /applicant/register
// ---------------------------------------------------------------------------
async function register(request, env) {
  const sql = getDb(env);
  const tenant = await resolveTenant(request, sql, env);
  if (!tenant) return error('Tenant not found or not available', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const { email, password, full_name, phone } = body;

  if (!email || !password || !full_name) {
    return error('email, password, and full_name are required');
  }

  // Basic email shape check — full validation is the DB constraint
  if (!email.includes('@')) return error('Invalid email address');
  if (password.length < 8)  return error('Password must be at least 8 characters');
  if (full_name.trim().length < 2) return error('Full name is too short');

  // Check for existing account (same email, same tenant)
  const existing = await sql`
    SELECT id FROM applicant_accounts
    WHERE tenant_id = ${tenant.id}
      AND email = ${email.toLowerCase().trim()}
  `;
  if (existing.length > 0) return error('An account with this email already exists', 409);

  const passwordHash = await hashPassword(password);

  const rows = await sql`
    INSERT INTO applicant_accounts (tenant_id, email, password_hash, full_name, phone)
    VALUES (
      ${tenant.id},
      ${email.toLowerCase().trim()},
      ${passwordHash},
      ${full_name.trim()},
      ${phone?.trim() ?? null}
    )
    RETURNING id, email, full_name, phone, created_at
  `;

  const account = rows[0];

  await writeAuditLog(sql, {
    tenantId:   tenant.id,
    actorType:  'applicant',
    actorId:    account.id,
    action:     'applicant_account.registered',
    recordType: 'applicant_account',
    recordId:   account.id,
  });

  // Issue session immediately after registration — no need for separate login step
  const payload = {
    applicant_account_id: account.id,
    tenant_id:            tenant.id,
    email:                account.email,
    full_name:            account.full_name,
  };

  const token = await signApplicantSession(payload, env.JWT_SECRET);

  return json(
    {
      applicant: {
        id:        account.id,
        email:     account.email,
        full_name: account.full_name,
      },
      tenant_id: tenant.id,
    },
    201,
    { 'Set-Cookie': buildApplicantCookie(token) }
  );
}

// ---------------------------------------------------------------------------
// POST /applicant/login
// ---------------------------------------------------------------------------
async function login(request, env) {
  const sql = getDb(env);
  const tenant = await resolveTenant(request, sql, env);
  if (!tenant) return error('Tenant not found or not available', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const { email, password } = body;
  if (!email || !password) return error('Email and password are required');

  const ip = getClientIp(request);
  const normEmail = email.toLowerCase().trim();

  const { limited, reason } = await checkLoginRateLimit(env.RATE_LIMIT, ip, normEmail, 'applicant');
  if (limited) return error(reason, 429);

  const rows = await sql`
    SELECT id, email, full_name, phone, password_hash
    FROM applicant_accounts
    WHERE tenant_id = ${tenant.id}
      AND email = ${normEmail}
  `;

  // Constant-time response regardless of whether account exists — prevents enumeration
  if (rows.length === 0) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normEmail, 'applicant');
    return error('Invalid credentials', 401);
  }
  const account = rows[0];

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normEmail, 'applicant');
    return error('Invalid credentials', 401);
  }

  await clearEmailRateLimit(env.RATE_LIMIT, normEmail, 'applicant');

  const payload = {
    applicant_account_id: account.id,
    tenant_id:            tenant.id,
    email:                account.email,
    full_name:            account.full_name,
  };

  const token = await signApplicantSession(payload, env.JWT_SECRET);

  return json(
    {
      applicant: {
        id:        account.id,
        email:     account.email,
        full_name: account.full_name,
      },
      tenant_id: tenant.id,
    },
    200,
    { 'Set-Cookie': buildApplicantCookie(token) }
  );
}

// ---------------------------------------------------------------------------
// POST /applicant/logout
// ---------------------------------------------------------------------------
async function logout() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearApplicantCookie(),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /applicant/me
// ---------------------------------------------------------------------------
async function me(request, env) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  return json({ session });
}

// ---------------------------------------------------------------------------
// GET /api/applicant/profile
// ---------------------------------------------------------------------------
async function getProfile(request, env) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, email, full_name, phone
    FROM applicant_accounts
    WHERE id = ${session.applicant_account_id}
      AND tenant_id = ${session.tenant_id}
  `;
  if (rows.length === 0) return error('Account not found', 404);

  return json({ profile: rows[0] });
}

// ---------------------------------------------------------------------------
// PUT /api/applicant/profile
// Updates name, phone, optionally email, optionally password.
// ---------------------------------------------------------------------------
async function updateProfile(request, env) {
  const session = await requireApplicant(request, env);
  if (!session) return error('Not authenticated', 401);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON body'); }

  const full_name        = body.full_name?.trim() ?? '';
  const phone            = body.phone?.trim() || null;
  const new_email        = body.email?.trim().toLowerCase() || null;
  const current_password = body.current_password || null;
  const new_password     = body.new_password || null;

  if (!full_name || full_name.length < 2) return error('Full name is required.');

  const sql = getDb(env);

  // Fetch current account to verify password when changing credentials
  const accountRows = await sql`
    SELECT id, email, password_hash
    FROM applicant_accounts
    WHERE id = ${session.applicant_account_id}
      AND tenant_id = ${session.tenant_id}
  `;
  if (accountRows.length === 0) return error('Account not found', 404);
  const account = accountRows[0];

  // Email or password change requires current password
  if (new_email || new_password) {
    if (!current_password) return error('Current password is required to change your email or password.');
    const valid = await verifyPassword(current_password, account.password_hash);
    if (!valid) return error('Current password is incorrect.');
  }

  // If changing email, check it is not already in use by another account on this tenant
  if (new_email && new_email !== account.email) {
    const clash = await sql`
      SELECT id FROM applicant_accounts
      WHERE email = ${new_email} AND tenant_id = ${session.tenant_id} AND id != ${account.id}
    `;
    if (clash.length > 0) return error('That email address is already in use.', 409);
  }

  // Build the update
  let newPasswordHash = null;
  if (new_password) {
    if (new_password.length < 8) return error('New password must be at least 8 characters.');
    newPasswordHash = await hashPassword(new_password);
  }

  const resolvedEmail = (new_email && new_email !== account.email) ? new_email : account.email;

  const updated = await sql`
    UPDATE applicant_accounts
    SET
      full_name     = ${full_name},
      phone         = ${phone},
      email         = ${resolvedEmail},
      password_hash = CASE WHEN ${newPasswordHash} IS NOT NULL THEN ${newPasswordHash} ELSE password_hash END,
      updated_at    = NOW()
    WHERE id = ${session.applicant_account_id}
      AND tenant_id = ${session.tenant_id}
    RETURNING id, email, full_name, phone
  `;
  if (updated.length === 0) return error('Account not found', 404);

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  'applicant',
    actorId:    session.applicant_account_id,
    action:     'applicant.profile_updated',
    recordType: 'applicant_account',
    recordId:   session.applicant_account_id,
    meta: {
      full_name,
      email_changed:    resolvedEmail !== account.email,
      password_changed: !!newPasswordHash,
    },
  });

  return json({ profile: updated[0] });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleApplicantAuthRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/applicant/register') return register(request, env);
  if (method === 'POST' && url.pathname === '/api/applicant/login')    return login(request, env);
  if (method === 'POST' && url.pathname === '/api/applicant/logout')   return logout();
  if (method === 'GET'  && url.pathname === '/api/applicant/me')       return me(request, env);
  if (method === 'GET'  && url.pathname === '/api/applicant/profile')  return getProfile(request, env);
  if (method === 'PUT'  && url.pathname === '/api/applicant/profile')  return updateProfile(request, env);

  return null;
}
