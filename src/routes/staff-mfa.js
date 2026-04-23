/**
 * Staff MFA routes — TOTP enrolment, confirmation, and disable.
 *
 * Routes:
 *   POST /api/staff/mfa/enrol    — generate a new TOTP secret, return QR URI (not yet active)
 *   POST /api/staff/mfa/confirm  — verify first code to activate MFA
 *   POST /api/staff/mfa/disable  — disable MFA (requires current password + code)
 *   POST /api/staff/mfa/verify   — exchange mfa_pending cookie for a full session
 */

import { getDb } from '../db/client.js';
import { requireStaff } from '../lib/guards.js';
import { verifyPassword } from '../lib/passwords.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  generateTotpSecret,
  buildOtpAuthUri,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotp,
} from '../lib/totp.js';
import { buildCookie, signSession } from '../lib/session.js';
import { verifyMfaPending, clearMfaPendingCookie } from '../lib/mfa-pending.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// ---------------------------------------------------------------------------
// POST /api/staff/mfa/enrol
// Generates a new TOTP secret and returns the otpauth:// URI for QR display.
// Does NOT activate MFA — user must confirm a code first via /confirm.
// ---------------------------------------------------------------------------
async function enrol(request, env) {
  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  if (!env.TOTP_ENCRYPTION_KEY) return error('MFA not configured on this server', 503);

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, email, full_name, totp_enabled
    FROM users
    WHERE id = ${session.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return error('User not found', 404);
  if (user.totp_enabled) return error('MFA is already enabled. Disable it first to re-enrol.', 409);

  const secret = generateTotpSecret();
  const encrypted = await encryptTotpSecret(secret, env.TOTP_ENCRYPTION_KEY);

  // Store the secret immediately (but totp_enabled remains false until confirmed)
  await sql`
    UPDATE users
    SET totp_secret = ${encrypted}, totp_enabled = FALSE
    WHERE id = ${session.user_id}
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  session.role,
    actorId:    session.user_id,
    action:     'staff.mfa_enrolment_started',
    recordType: 'user',
    recordId:   session.user_id,
  });

  const issuer = `Zanflo${session.tenant_slug ? ` (${session.tenant_slug})` : ''}`;
  const uri = buildOtpAuthUri(secret, user.email, issuer);

  return json({ uri, secret });
}

// ---------------------------------------------------------------------------
// POST /api/staff/mfa/confirm
// Body: { code: "123456" }
// Verifies the first TOTP code and sets totp_enabled = true.
// ---------------------------------------------------------------------------
async function confirm(request, env) {
  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  if (!env.TOTP_ENCRYPTION_KEY) return error('MFA not configured on this server', 503);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const code = (body.code || '').trim().replace(/\s/g, '');
  if (!code) return error('Code is required');

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, totp_secret, totp_enabled
    FROM users
    WHERE id = ${session.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return error('User not found', 404);
  if (!user.totp_secret) return error('No MFA setup in progress. Start enrolment first.', 409);
  if (user.totp_enabled) return error('MFA is already enabled.', 409);

  const plainSecret = await decryptTotpSecret(user.totp_secret, env.TOTP_ENCRYPTION_KEY);
  const valid = await verifyTotp(plainSecret, code);
  if (!valid) return error('Incorrect code. Check your authenticator app and try again.', 401);

  await sql`
    UPDATE users
    SET totp_enabled = TRUE
    WHERE id = ${session.user_id}
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  session.role,
    actorId:    session.user_id,
    action:     'staff.mfa_enabled',
    recordType: 'user',
    recordId:   session.user_id,
  });

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/staff/mfa/disable
// Body: { password: "...", code: "123456" }
// Requires both current password and a valid TOTP code.
// ---------------------------------------------------------------------------
async function disable(request, env) {
  const session = await requireStaff(request, env);
  if (!session) return error('Not authenticated', 401);

  if (!env.TOTP_ENCRYPTION_KEY) return error('MFA not configured on this server', 503);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const { password, code } = body;
  if (!password || !code) return error('Password and code are required');

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, password_hash, totp_secret, totp_enabled
    FROM users
    WHERE id = ${session.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return error('User not found', 404);
  if (!user.totp_enabled) return error('MFA is not enabled.', 409);

  const pwValid = await verifyPassword(password, user.password_hash);
  if (!pwValid) return error('Incorrect password.', 401);

  const plainSecret = await decryptTotpSecret(user.totp_secret, env.TOTP_ENCRYPTION_KEY);
  const codeValid = await verifyTotp(plainSecret, code.trim().replace(/\s/g, ''));
  if (!codeValid) return error('Incorrect authenticator code.', 401);

  await sql`
    UPDATE users
    SET totp_secret = NULL, totp_enabled = FALSE
    WHERE id = ${session.user_id}
  `;

  await writeAuditLog(sql, {
    tenantId:   session.tenant_id,
    actorType:  session.role,
    actorId:    session.user_id,
    action:     'staff.mfa_disabled',
    recordType: 'user',
    recordId:   session.user_id,
  });

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/staff/mfa/verify
// Called from the login page second step.
// Reads the mfa_pending cookie, verifies the TOTP code, issues a full session.
// ---------------------------------------------------------------------------
async function verify(request, env) {
  if (!env.TOTP_ENCRYPTION_KEY) return error('MFA not configured on this server', 503);

  const pending = await verifyMfaPending(request, env);
  if (!pending) return error('MFA session expired or invalid. Please log in again.', 401);

  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const code = (body.code || '').trim().replace(/\s/g, '');
  if (!code) return error('Code is required');

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, totp_secret, totp_enabled
    FROM users
    WHERE id = ${pending.user_id}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || !user.totp_enabled || !user.totp_secret) {
    return error('MFA not configured for this account.', 401);
  }

  const plainSecret = await decryptTotpSecret(user.totp_secret, env.TOTP_ENCRYPTION_KEY);
  const valid = await verifyTotp(plainSecret, code);
  if (!valid) return error('Incorrect code. Try again.', 401);

  const token = await signSession(pending.sessionPayload, env.JWT_SECRET);

  await writeAuditLog(sql, {
    tenantId:   pending.sessionPayload.tenant_id,
    actorType:  pending.sessionPayload.role,
    actorId:    pending.user_id,
    action:     'staff.login_mfa_verified',
    recordType: 'user',
    recordId:   pending.user_id,
  });

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', buildCookie(token));
  headers.append('Set-Cookie', clearMfaPendingCookie());

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleStaffMfaRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/staff/mfa/enrol')   return enrol(request, env);
  if (method === 'POST' && url.pathname === '/api/staff/mfa/confirm') return confirm(request, env);
  if (method === 'POST' && url.pathname === '/api/staff/mfa/disable') return disable(request, env);
  if (method === 'POST' && url.pathname === '/api/staff/mfa/verify')  return verify(request, env);

  return null;
}
