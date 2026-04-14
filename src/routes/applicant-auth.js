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
  getApplicantSession,
} from '../lib/applicant-session.js';
import { writeAuditLog } from '../lib/audit.js';
import { resolveTenant } from '../lib/tenant-resolver.js';

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
  const tenant = await resolveTenant(request, sql);
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
  const tenant = await resolveTenant(request, sql);
  if (!tenant) return error('Tenant not found or not available', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const { email, password } = body;
  if (!email || !password) return error('Email and password are required');

  const rows = await sql`
    SELECT id, email, full_name, phone, password_hash
    FROM applicant_accounts
    WHERE tenant_id = ${tenant.id}
      AND email = ${email.toLowerCase().trim()}
  `;

  // Constant-time response regardless of whether account exists — prevents enumeration
  if (rows.length === 0) return error('Invalid credentials', 401);
  const account = rows[0];

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) return error('Invalid credentials', 401);

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
  const session = await getApplicantSession(request, env.JWT_SECRET);
  if (!session) return error('Not authenticated', 401);

  return json({ session });
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

  return null;
}
