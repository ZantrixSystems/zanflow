/**
 * Tenant resolver — dual-mode.
 *
 * Resolves the current tenant from the incoming request using two strategies,
 * tried in order:
 *
 *   1. Subdomain (production model)
 *      Host: riverside.zanflow.co.uk  →  extract 'riverside'  →  lookup by subdomain
 *
 *   2. X-Tenant-Slug header (fallback for workers.dev / local dev)
 *      X-Tenant-Slug: riverside  →  lookup by slug
 *
 * The fallback exists only because workers.dev does not support wildcard subdomains.
 * Once the platform is running on a real domain with a wildcard DNS record
 * (*.zanflow.co.uk → Worker), strategy 2 can be removed in this file alone.
 * No other file needs to change.
 *
 * Tenant status is enforced here:
 *   - 'active' and 'trial' → allowed
 *   - anything else        → returns null (caller returns 403)
 *
 * Usage:
 *   import { resolveTenant } from '../lib/tenant-resolver.js';
 *   const tenant = await resolveTenant(request, sql);
 *   if (!tenant) return error('Tenant not found or not available', 403);
 *
 * Returned object shape:
 *   { id, name, slug, subdomain, status }
 *
 * ── How to remove the fallback later ────────────────────────────────────────
 * 1. Delete the block marked "FALLBACK — remove when on real domain"
 * 2. Remove X-Tenant-Slug from frontend/src/api.js headers
 * 3. Remove VITE_TENANT_SLUG from frontend .env files
 * Done. No other code changes needed.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Platform domain — the apex domain for this installation.
 * Subdomains are extracted by stripping this suffix from the Host header.
 *
 * Set to match your actual domain when deploying to production.
 * The fallback path is used automatically when the host does NOT end with this.
 */
const PLATFORM_DOMAIN = 'zanflow.co.uk';

/**
 * Tenant statuses that are allowed to receive API traffic.
 * Suspended, expired, and deleted tenants are blocked at the resolver level.
 */
const ALLOWED_STATUSES = new Set(['active', 'trial']);

/**
 * Resolve the tenant for this request.
 *
 * @param {Request} request
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 * @returns {Promise<{id: string, name: string, slug: string, subdomain: string|null, status: string} | null>}
 */
export async function resolveTenant(request, sql) {
  const host = request.headers.get('host') ?? '';

  // ── Strategy 1: Subdomain from Host header (production model) ──────────────
  // Match: <subdomain>.zanflow.co.uk
  // Does NOT match: zanflow.co.uk (apex), zanflow.zantrixsystems.workers.dev, localhost
  if (host.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const subdomain = host.slice(0, host.length - PLATFORM_DOMAIN.length - 1).toLowerCase();

    // Reject empty, multi-level, or reserved subdomains
    if (subdomain && !subdomain.includes('.') && !RESERVED_SUBDOMAINS.has(subdomain)) {
      const rows = await sql`
        SELECT id, name, slug, subdomain, status
        FROM tenants
        WHERE subdomain = ${subdomain}
      `;
      const tenant = rows[0] ?? null;
      if (!tenant) return null;
      if (!ALLOWED_STATUSES.has(tenant.status)) return null;
      return tenant;
    }
  }

  // ── FALLBACK — remove when on real domain ──────────────────────────────────
  // Strategy 2: X-Tenant-Slug header (workers.dev / local dev only)
  const slug = request.headers.get('X-Tenant-Slug');
  if (slug) {
    const rows = await sql`
      SELECT id, name, slug, subdomain, status
      FROM tenants
      WHERE slug = ${slug.toLowerCase().trim()}
    `;
    const tenant = rows[0] ?? null;
    if (!tenant) return null;
    if (!ALLOWED_STATUSES.has(tenant.status)) return null;
    return tenant;
  }
  // ── END FALLBACK ───────────────────────────────────────────────────────────

  return null;
}

/**
 * Subdomains that are reserved and must never resolve to a tenant.
 * Add to this list as the platform grows.
 */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'platform',
  'app',
  'mail',
  'smtp',
  'assets',
  'static',
  'cdn',
  'status',
  'login',
  'auth',
  'billing',
  'staging',
  'dev',
  'test',
  'sandbox',
  'demo',
]);
