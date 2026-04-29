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

import { handleApplicantAuthRoutes }   from './routes/applicant-auth.js';
import { handleApplicationTypeRoutes } from './routes/application-types.js';
import { handleApplicationRoutes }     from './routes/applications.js';
import { handleAdminApplicationRoutes } from './routes/admin-applications.js';
import { handleAdminCaseRoutes } from './routes/admin-cases.js';
import { handleAdminPremiseCaseRoutes } from './routes/admin-premise-cases.js';
import { handleExternalCaseShareRoutes } from './routes/external-case-shares.js';
import { handleAdminLicenceSectionRoutes } from './routes/admin-licence-sections.js';
import { handleApplicantCaseRoutes }   from './routes/applicant-cases.js';
import { handleAdminApplicationSetupRoutes } from './routes/admin-application-setup.js';
import { handleAdminApplicationTypeRoutes } from './routes/admin-application-types.js';
import { handleAdminPremisesVerificationRoutes } from './routes/admin-premises-verifications.js';
import { handleAdminAuditRoutes }      from './routes/admin-audit.js';
import { handleAdminNotificationRoutes } from './routes/admin-notifications.js';
import { handleAdminOnboardingRoutes } from './routes/admin-onboarding.js';
import { handleAdminSettingsRoutes }   from './routes/admin-settings.js';
import { handleAdminUserRoutes }       from './routes/admin-users.js';
import { handleAdminRoleRoutes }       from './routes/admin-roles.js';
import { handlePlatformAuthRoutes }    from './routes/platform-auth.js';
import { handlePlatformAdminRoutes }   from './routes/platform-admin.js';
import { handlePremisesRoutes }        from './routes/premises.js';
import { handleStaffAuthRoutes }       from './routes/staff-auth.js';
import { handleStaffMfaRoutes }        from './routes/staff-mfa.js';
import { handleTenantPublicRoutes }    from './routes/tenant-public.js';
import { getDb }                       from './db/client.js';
import { isTenantHost }                from './lib/request-context.js';
import { resolveTenant }               from './lib/tenant-resolver.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tenantUnavailableHtml() {
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tenant not found</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f1e8;
        --panel: #fffaf2;
        --border: #d8c8ab;
        --text: #1f2328;
        --muted: #615c55;
        --accent: #7d4e10;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(125, 78, 16, 0.10), transparent 30%),
          linear-gradient(180deg, #f8f5ef 0%, var(--bg) 100%);
        color: var(--text);
        font: 16px/1.5 Georgia, "Times New Roman", serif;
      }
      .panel {
        width: min(680px, 100%);
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 32px;
        box-shadow: 0 18px 60px rgba(67, 48, 17, 0.10);
      }
      .eyebrow {
        margin: 0 0 8px;
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1.1;
      }
      p {
        margin: 0 0 14px;
        color: var(--muted);
      }
      a {
        display: inline-block;
        margin-top: 10px;
        padding: 12px 18px;
        border-radius: 999px;
        background: var(--accent);
        color: #fffaf2;
        text-decoration: none;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <p class="eyebrow">Tenant unavailable</p>
      <h1>Tenant not found</h1>
      <p>This council site does not exist, has been deleted, or is not currently active.</p>
      <p>Check the web address and try again. If you expected this council portal to be available, return to the main Zanflo site or contact platform support.</p>
      <a href="https://zanflo.com">Go to zanflo.com</a>
    </main>
  </body>
</html>`, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
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
            WHERE status = 'pending_setup'
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
          deleted_premises AS (
            DELETE FROM premises p
            USING expired_tenants et
            WHERE p.tenant_id = et.id
            RETURNING p.id
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
          deleted_application_field_settings AS (
            DELETE FROM tenant_application_field_settings tafs
            USING expired_tenants et
            WHERE tafs.tenant_id = et.id
            RETURNING tafs.id
          ),
          deleted_application_settings AS (
            DELETE FROM tenant_application_settings tas
            USING expired_tenants et
            WHERE tas.tenant_id = et.id
            RETURNING tas.tenant_id
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
    const sql = getDb(env);

    // Only handle /api/* — everything else falls through to static assets
    if (!url.pathname.startsWith('/api/')) {
      if (isTenantHost(request) && url.pathname !== '/admin/bootstrap') {
        const accept = request.headers.get('accept') ?? '';
        const tenant = await resolveTenant(request, sql, env);

        if (!tenant) {
          if (accept.includes('text/html')) {
            return tenantUnavailableHtml();
          }

          return new Response('Tenant not found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
      }

      // Serve static assets. For HTML responses (index.html / SPA fallback),
      // strip Cloudflare edge caching so browsers always get the latest
      // asset-fingerprinted bundle references.
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        const headers = new Headers(assetResponse.headers);
        headers.set('Cache-Control', 'no-store');
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          headers,
        });
      }
      return assetResponse;
    }

    try {
      const response =
        (await handleApplicantAuthRoutes(request, env))        ??
        (await handleStaffMfaRoutes(request, env))             ??
        (await handleStaffAuthRoutes(request, env))            ??
        (await handlePlatformAuthRoutes(request, env))         ??
        (await handleApplicationTypeRoutes(request, env))      ??
        (await handleTenantPublicRoutes(request, env))         ??
        (await handlePremisesRoutes(request, env))             ??
        // New premise-licence-case routes (MVP model)
        (await handleApplicantCaseRoutes(request, env))        ??
        (await handleExternalCaseShareRoutes(request, env))    ??
        (await handleAdminPremiseCaseRoutes(request, env))     ??
        (await handleAdminLicenceSectionRoutes(request, env))  ??
        // Legacy application routes (kept for transition)
        (await handleApplicationRoutes(request, env))          ??
        (await handleAdminCaseRoutes(request, env))            ??
        (await handleAdminApplicationRoutes(request, env))     ??
        (await handleAdminApplicationSetupRoutes(request, env)) ??
        (await handleAdminApplicationTypeRoutes(request, env)) ??
        (await handleAdminPremisesVerificationRoutes(request, env)) ??
        (await handleAdminUserRoutes(request, env))            ??
        (await handleAdminRoleRoutes(request, env))            ??
        (await handleAdminOnboardingRoutes(request, env))      ??
        (await handleAdminSettingsRoutes(request, env))        ??
        (await handleAdminAuditRoutes(request, env))           ??
        (await handleAdminNotificationRoutes(request, env))    ??
        (await handlePlatformAdminRoutes(request, env))        ??
        json({ error: 'Not found' }, 404);

      return response;
    } catch (err) {
      console.error('[worker] Unhandled error:', err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
