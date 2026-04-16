/**
 * Main worker entry point.
 *
 * The Worker serves both the API and the React frontend from the same origin.
 * No CORS configuration needed — frontend and backend share the same domain.
 *
 * Request routing:
 *   /api/*  → API route handlers (auth, applications, etc.)
 *   *       → Static assets from frontend/dist (served by the [assets] binding)
 *
 * Environment variables required:
 *   DATABASE_URL  — Neon Postgres connection string (secret)
 *   JWT_SECRET    — HMAC signing secret for session JWTs (secret)
 *   GOOGLE_KMS_KEY_NAME              — Full Google KMS CryptoKey resource name
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL     — Service account email for KMS access
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — PEM private key for that service account
 *
 * Local dev (.dev.vars):
 *   DATABASE_URL=postgres://...
 *   JWT_SECRET=some-long-random-string
 */

import { handleAuthRoutes }            from './routes/auth.js';
import { handleApplicantAuthRoutes }   from './routes/applicant-auth.js';
import { handleApplicationTypeRoutes } from './routes/application-types.js';
import { handleApplicationRoutes }     from './routes/applications.js';
import { handlePlatformAdminRoutes }   from './routes/platform-admin.js';
import { handlePlatformBootstrapRoutes } from './routes/platform-bootstrap.js';
import { handlePlatformPublicRoutes }  from './routes/platform-public.js';
import { getDb }                       from './db/client.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  // ---------------------------------------------------------------------------
  // Scheduled handler — nightly draft expiry cleanup
  // Cron: "0 2 * * *" (02:00 UTC daily)
  // ---------------------------------------------------------------------------
  async scheduled(_event, env, ctx) {
    const sql = getDb(env);
    ctx.waitUntil(
      Promise.all([
        sql`
          DELETE FROM applications
          WHERE status = 'draft'
            AND expires_at IS NOT NULL
            AND expires_at < NOW()
        `,
        sql`
          WITH expired_tenants AS (
            SELECT id
            FROM tenants
            WHERE status = 'pending_verification'
              AND activation_expires_at IS NOT NULL
              AND activation_expires_at < NOW()
          ),
          deleted_assignments AS (
            DELETE FROM tenant_role_assignments tra
            USING expired_tenants et
            WHERE tra.tenant_id = et.id
            RETURNING tra.id
          ),
          deleted_apps AS (
            DELETE FROM applications a
            USING expired_tenants et
            WHERE a.tenant_id = et.id
            RETURNING a.id
          ),
          deleted_applicants AS (
            DELETE FROM applicant_accounts aa
            USING expired_tenants et
            WHERE aa.tenant_id = et.id
            RETURNING aa.id
          ),
          deleted_enabled_types AS (
            DELETE FROM tenant_enabled_application_types teat
            USING expired_tenants et
            WHERE teat.tenant_id = et.id
            RETURNING teat.id
          ),
          deleted_audit AS (
            DELETE FROM audit_logs al
            USING expired_tenants et
            WHERE al.tenant_id = et.id
            RETURNING al.id
          ),
          deleted_memberships AS (
            DELETE FROM memberships m
            USING expired_tenants et
            WHERE m.tenant_id = et.id
            RETURNING m.user_id
          ),
          orphan_users AS (
            SELECT DISTINCT dm.user_id
            FROM deleted_memberships dm
            LEFT JOIN memberships m ON m.user_id = dm.user_id
            LEFT JOIN users u ON u.id = dm.user_id
            WHERE m.user_id IS NULL
              AND COALESCE(u.is_platform_admin, false) = false
          ),
          deleted_users AS (
            DELETE FROM users u
            USING orphan_users ou
            WHERE u.id = ou.user_id
            RETURNING u.id
          ),
          deleted_limits AS (
            DELETE FROM tenant_limits tl
            USING expired_tenants et
            WHERE tl.tenant_id = et.id
            RETURNING tl.tenant_id
          ),
          deleted_tenants AS (
            DELETE FROM tenants t
            USING expired_tenants et
            WHERE t.id = et.id
            RETURNING t.id
          )
          SELECT COUNT(*)::int AS count
          FROM deleted_tenants
        `,
      ]).then(([draftResult, tenantCleanupResult]) => {
        console.log(`[cron] Deleted ${draftResult.count ?? draftResult.length ?? '?'} expired draft applications`);
        console.log(`[cron] Deleted ${tenantCleanupResult[0]?.count ?? 0} expired pending tenants`);
      }).catch((err) => {
        console.error('[cron] Cleanup failed:', err);
      })
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Only handle /api/* — everything else falls through to static assets
    if (!url.pathname.startsWith('/api/')) {
      // Return null to let the assets binding serve the file.
      // If no asset matches, the binding returns a 404 automatically.
      return env.ASSETS.fetch(request);
    }

    try {
      const response =
        (await handleAuthRoutes(request, env))            ??
        (await handleApplicantAuthRoutes(request, env))   ??
        (await handleApplicationTypeRoutes(request, env)) ??
        (await handleApplicationRoutes(request, env))     ??
        (await handlePlatformBootstrapRoutes(request, env)) ??
        (await handlePlatformPublicRoutes(request, env))  ??
        (await handlePlatformAdminRoutes(request, env))   ??
        json({ error: 'Not found' }, 404);

      return response;
    } catch (err) {
      console.error('[worker] Unhandled error:', err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
