/**
 * Login rate limiting via Cloudflare KV.
 *
 * Two independent counters per attempt:
 *   - IP-based:    up to IP_MAX attempts from the same IP in IP_WINDOW_SECS
 *   - Email-based: up to EMAIL_MAX attempts for the same email in EMAIL_WINDOW_SECS
 *
 * Either counter breaching its limit returns { limited: true }.
 * KV TTL auto-expires the keys — no manual cleanup needed.
 *
 * If RATE_LIMIT KV is not bound (e.g. local dev without --remote), the check
 * is skipped and { limited: false } is returned so development is unaffected.
 */

const IP_MAX          = 10;   // attempts per IP before lockout
const IP_WINDOW_SECS  = 900;  // 15 minutes
const EMAIL_MAX       = 5;    // attempts per email before lockout
const EMAIL_WINDOW_SECS = 900;

/**
 * Call before password verification on any login endpoint.
 *
 * @param {KVNamespace|undefined} kv  - env.RATE_LIMIT binding
 * @param {string} ip                 - client IP (CF-Connecting-IP header)
 * @param {string} email              - normalised email from request body
 * @param {string} namespace          - prefix to isolate applicant/staff/platform counters
 * @returns {{ limited: boolean, reason?: string }}
 */
export async function checkLoginRateLimit(kv, ip, email, namespace = 'default') {
  if (!kv) return { limited: false };

  const ipKey    = `rl:${namespace}:ip:${ip}`;
  const emailKey = `rl:${namespace}:email:${email.toLowerCase()}`;

  const [ipRaw, emailRaw] = await Promise.all([
    kv.get(ipKey),
    kv.get(emailKey),
  ]);

  const ipCount    = ipRaw    ? parseInt(ipRaw, 10)    : 0;
  const emailCount = emailRaw ? parseInt(emailRaw, 10) : 0;

  if (ipCount >= IP_MAX) {
    return { limited: true, reason: 'Too many login attempts from your network. Please try again later.' };
  }
  if (emailCount >= EMAIL_MAX) {
    return { limited: true, reason: 'Too many login attempts for this account. Please try again in 15 minutes.' };
  }

  return { limited: false };
}

/**
 * Call after a failed password check to increment counters.
 */
export async function recordFailedLogin(kv, ip, email, namespace = 'default') {
  if (!kv) return;

  const ipKey    = `rl:${namespace}:ip:${ip}`;
  const emailKey = `rl:${namespace}:email:${email.toLowerCase()}`;

  const [ipRaw, emailRaw] = await Promise.all([
    kv.get(ipKey),
    kv.get(emailKey),
  ]);

  const newIp    = (ipRaw    ? parseInt(ipRaw, 10)    : 0) + 1;
  const newEmail = (emailRaw ? parseInt(emailRaw, 10) : 0) + 1;

  await Promise.all([
    kv.put(ipKey,    String(newIp),    { expirationTtl: IP_WINDOW_SECS }),
    kv.put(emailKey, String(newEmail), { expirationTtl: EMAIL_WINDOW_SECS }),
  ]);
}

/**
 * Call after a successful login to clear the email counter.
 * Leaves the IP counter in place — it decays naturally.
 */
export async function clearEmailRateLimit(kv, email, namespace = 'default') {
  if (!kv) return;
  await kv.delete(`rl:${namespace}:email:${email.toLowerCase()}`);
}

/**
 * Extract the real client IP from a Cloudflare Workers request.
 * CF-Connecting-IP is set by Cloudflare and cannot be spoofed by clients.
 */
export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
