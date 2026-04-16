import { getDb } from '../db/client.js';
import { verifyPassword } from '../lib/passwords.js';
import { signSession, verifySession, buildCookie, clearCookie, getCookieValue } from '../lib/session.js';

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
// POST /auth/login
// ---------------------------------------------------------------------------
async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const identifier = body.identifier?.trim() || body.email?.trim() || '';
  const { password } = body;
  if (!identifier || !password) return error('Username or email and password are required');

  const sql = getDb(env);

  const users = await sql`
    SELECT id, email, username, full_name, password_hash, is_platform_admin
    FROM users
    WHERE email = ${identifier.toLowerCase()}
       OR LOWER(username) = ${identifier.toLowerCase()}
  `;

  // Return identical error whether user not found or password wrong
  // — prevents email enumeration
  if (users.length === 0) return error('Invalid credentials', 401);
  const user = users[0];

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return error('Invalid credentials', 401);

  // Load first membership — a user may belong to multiple tenants,
  // multi-tenant switching can be added later
  const memberships = await sql`
    SELECT m.tenant_id, m.role, t.name AS tenant_name, t.slug AS tenant_slug
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ${user.id}
    ORDER BY m.created_at ASC
    LIMIT 1
  `;

  const membership = memberships[0] ?? null;

  const payload = {
    user_id:          user.id,
    email:            user.email,
    username:         user.username,
    full_name:        user.full_name,
    is_platform_admin: user.is_platform_admin,
    tenant_id:        membership?.tenant_id  ?? null,
    tenant_slug:      membership?.tenant_slug ?? null,
    role:             membership?.role        ?? null,
  };

  const token = await signSession(payload, env.JWT_SECRET);

  return json(
    {
      user: {
        id:               user.id,
        email:            user.email,
        username:         user.username,
        full_name:        user.full_name,
        is_platform_admin: user.is_platform_admin,
      },
      tenant_id:   membership?.tenant_id   ?? null,
      tenant_name: membership?.tenant_name ?? null,
      role:        membership?.role         ?? null,
    },
    200,
    { 'Set-Cookie': buildCookie(token) }
  );
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
async function logout() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------
async function me(request, env) {
  const token = getCookieValue(request, 'session');
  if (!token) return error('Not authenticated', 401);

  const session = await verifySession(token, env.JWT_SECRET);
  if (!session) return error('Invalid or expired session', 401);

  return json({ session });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function handleAuthRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'POST' && url.pathname === '/api/auth/login')  return login(request, env);
  if (method === 'POST' && url.pathname === '/api/auth/logout') return logout();
  if (method === 'GET'  && url.pathname === '/api/auth/me')     return me(request, env);

  return null;
}
