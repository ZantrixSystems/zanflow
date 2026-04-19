import { getDb } from '../db/client.js';
import { requireTenantStaff } from '../lib/guards.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function listNotifications(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager', 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, type, title, body, link, read_at, created_at
    FROM notifications
    WHERE tenant_id = ${session.tenant_id}
      AND user_id   = ${session.user_id}
    ORDER BY created_at DESC
    LIMIT 30
  `;

  const unread_count = rows.filter((r) => !r.read_at).length;
  return json({ notifications: rows, unread_count });
}

async function markRead(request, env, notificationId) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager', 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  await sql`
    UPDATE notifications
    SET read_at = NOW()
    WHERE id        = ${notificationId}
      AND tenant_id = ${session.tenant_id}
      AND user_id   = ${session.user_id}
      AND read_at IS NULL
  `;

  return json({ ok: true });
}

async function markAllRead(request, env) {
  const session = await requireTenantStaff(request, env, 'officer', 'manager', 'tenant_admin');
  if (!session) return error('Not authorised', 403);

  const sql = getDb(env);
  await sql`
    UPDATE notifications
    SET read_at = NOW()
    WHERE tenant_id = ${session.tenant_id}
      AND user_id   = ${session.user_id}
      AND read_at IS NULL
  `;

  return json({ ok: true });
}

export async function handleAdminNotificationRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/api/admin/notifications') {
    return listNotifications(request, env);
  }

  if (method === 'POST' && url.pathname === '/api/admin/notifications/read-all') {
    return markAllRead(request, env);
  }

  const readMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)\/read$/);
  if (readMatch && method === 'POST') {
    return markRead(request, env, readMatch[1]);
  }

  return null;
}
