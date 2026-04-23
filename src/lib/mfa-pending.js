/**
 * MFA pending session — bridges password-verified step and TOTP step.
 *
 * After a successful password check for a staff user who has MFA enabled,
 * we do NOT issue a full session. Instead we issue a short-lived signed
 * cookie that encodes the user_id and the full session payload to be issued
 * once the TOTP code is confirmed.
 *
 * Cookie: mfa_pending — HttpOnly, SameSite=Strict, Max-Age=300 (5 minutes)
 */

import { signSession, verifySession } from './session.js';

const COOKIE_NAME = 'mfa_pending';
const TTL = 300; // 5 minutes

export async function signMfaPending(payload, secret) {
  return signSession(payload, secret, TTL);
}

export async function verifyMfaPending(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySession(match[1], env.JWT_SECRET);
}

export function buildMfaPendingCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL}; Secure`;
}

export function clearMfaPendingCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure`;
}
