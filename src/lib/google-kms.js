/**
 * Google Cloud KMS client helpers.
 *
 * This is intentionally small and purpose-built for the current Phase 5
 * encryption spike. It centralises the Google auth and KMS REST calls so the
 * field-level logic can evolve later without touching route handlers.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_KMS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

let tokenCache = null;

function getRequiredEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function isGoogleKmsConfigured(env) {
  return Boolean(
    env.GOOGLE_KMS_KEY_NAME &&
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(bytes) {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function textToBase64(text) {
  return toBase64(new TextEncoder().encode(text));
}

function base64ToText(base64) {
  return new TextDecoder().decode(fromBase64(base64));
}

function normalisePrivateKey(privateKeyPem) {
  return privateKeyPem.replace(/\\n/g, '\n').trim();
}

async function importPrivateKey(privateKeyPem) {
  const body = normalisePrivateKey(privateKeyPem)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');

  return crypto.subtle.importKey(
    'pkcs8',
    fromBase64(body),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function createSignedJwt(env) {
  const serviceAccountEmail = getRequiredEnv(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getRequiredEnv(env, 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    scope: GOOGLE_KMS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signingKey = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const assertion = await createSignedJwt(env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to obtain Google access token: ${response.status} ${body}`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in ?? 3600) * 1000),
  };

  return tokenCache.accessToken;
}

async function kmsRequest(env, path, body) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google KMS request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export function getConfiguredKmsKeyName(env) {
  return getRequiredEnv(env, 'GOOGLE_KMS_KEY_NAME');
}

export async function encryptWithGoogleKms(env, plaintext, additionalAuthenticatedData) {
  const keyName = getConfiguredKmsKeyName(env);
  const response = await kmsRequest(env, `${keyName}:encrypt`, {
    plaintext: textToBase64(plaintext),
    additionalAuthenticatedData: additionalAuthenticatedData
      ? textToBase64(additionalAuthenticatedData)
      : undefined,
  });

  return {
    keyName,
    keyVersion: response.name ?? null,
    ciphertext: response.ciphertext,
  };
}

export async function decryptWithGoogleKms(env, keyName, ciphertext, additionalAuthenticatedData) {
  const response = await kmsRequest(env, `${keyName}:decrypt`, {
    ciphertext,
    additionalAuthenticatedData: additionalAuthenticatedData
      ? textToBase64(additionalAuthenticatedData)
      : undefined,
  });

  return base64ToText(response.plaintext);
}
