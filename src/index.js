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
      sql`
        DELETE FROM applications
        WHERE status = 'draft'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      `.then((result) => {
        console.log(`[cron] Deleted ${result.count ?? result.length ?? '?'} expired draft applications`);
      }).catch((err) => {
        console.error('[cron] Failed to delete expired drafts:', err);
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
        (await handlePlatformAdminRoutes(request, env))   ??
        json({ error: 'Not found' }, 404);

      return response;
    } catch (err) {
      console.error('[worker] Unhandled error:', err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
