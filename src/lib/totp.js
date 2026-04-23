/**
 * TOTP (Time-based One-Time Password) — RFC 6238 / RFC 4226.
 *
 * Pure Web Crypto implementation — no npm dependencies.
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator, 1Password.
 *
 * Secret storage: the raw TOTP secret is a random 20-byte value.
 * We encrypt it with AES-256-GCM before storing in the DB, using the
 * Worker's TOTP_ENCRYPTION_KEY secret (a 32-byte base64 key).
 *
 * Key setup (run once, store in wrangler secret):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   npx wrangler secret put TOTP_ENCRYPTION_KEY
 */

// ---------------------------------------------------------------------------
// Base32 — authenticator apps expect base32-encoded secrets in QR URIs
// ---------------------------------------------------------------------------

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

// ---------------------------------------------------------------------------
// TOTP core — RFC 6238
// ---------------------------------------------------------------------------

const PERIOD = 30;   // seconds per step
const DIGITS = 6;    // code length
const WINDOW = 1;    // accept 1 step before/after for clock skew

/**
 * Generate a TOTP code for a given base32 secret and timestamp.
 */
async function generateTotp(base32Secret, timestamp = Date.now()) {
  const keyBytes = base32Decode(base32Secret);
  const counter = Math.floor(timestamp / 1000 / PERIOD);

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  // Write 64-bit big-endian counter (JS numbers safe up to 2^53)
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff)
  ) % (10 ** DIGITS);

  return String(code).padStart(DIGITS, '0');
}

/**
 * Verify a TOTP code, accepting WINDOW steps either side for clock skew.
 */
export async function verifyTotp(base32Secret, code) {
  if (!code || code.length !== DIGITS) return false;
  const now = Date.now();
  for (let step = -WINDOW; step <= WINDOW; step++) {
    const expected = await generateTotp(base32Secret, now + step * PERIOD * 1000);
    if (expected === code) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Secret generation
// ---------------------------------------------------------------------------

/**
 * Generate a new random TOTP secret (20 bytes = 160 bits, base32 encoded).
 */
export function generateTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/**
 * Build an otpauth:// URI for QR code generation.
 * accountName: e.g. "alice@council.gov.uk"
 * issuer: e.g. "Zanflo (Riverside Council)"
 */
export function buildOtpAuthUri(base32Secret, accountName, issuer) {
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`;
}

// ---------------------------------------------------------------------------
// Encryption / decryption of the stored secret
// ---------------------------------------------------------------------------

async function getEncryptionKey(base64Key) {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a base32 TOTP secret for DB storage.
 * Returns a base64 string: 12-byte IV + ciphertext.
 */
export async function encryptTotpSecret(base32Secret, encryptionKeyBase64) {
  const key = await getEncryptionKey(encryptionKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(base32Secret);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a stored TOTP secret.
 */
export async function decryptTotpSecret(storedBase64, encryptionKeyBase64) {
  const key = await getEncryptionKey(encryptionKeyBase64);
  const combined = Uint8Array.from(atob(storedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}
