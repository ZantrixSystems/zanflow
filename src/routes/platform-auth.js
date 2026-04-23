import { getDb } from '../db/client.js';
import { hashBootstrapToken, generateBootstrapToken } from '../lib/bootstrap-tokens.js';
import { writeAuditLog } from '../lib/audit.js';
import { requirePlatformAdmin } from '../lib/guards.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { validateBootstrapPassword } from '../lib/password-policy.js';
import { isApexHost, isPlatformHost } from '../lib/request-context.js';
import { validateSubdomain } from '../lib/subdomains.js';
import { buildCookie, clearCookie, signSession } from '../lib/session.js';
import { handleCouncilLookup } from '../lib/council-lookup.js';
import { checkLoginRateLimit, recordFailedLogin, clearEmailRateLimit, getClientIp } from '../lib/rate-limit.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function buildTenantDefaults(name, adminName, adminEmail) {
  const councilName = name.trim();
  const ownerEmail = adminEmail.trim().toLowerCase();
  const ownerName = adminName.trim();

  return {
    councilDisplayName: councilName,
    supportContactName: ownerName,
    supportEmail: ownerEmail,
    internalAdminName: ownerName,
    internalAdminEmail: ownerEmail,
    welcomeText: `Welcome to ${councilName}'s licensing service.`,
    publicHomepageText: `Use this council-specific site to create an applicant account, start a premises licence application, save your progress, and return later.`,
    contactUsText: `Need help with ${councilName}'s licensing service? Use the support details above and quote your application reference if you already have one.`,
  };
}

async function signup(request, env) {
  if (!isApexHost(request)) return error('Not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const organisationName = body.organisation_name?.trim() || '';
  const slug = body.subdomain_slug?.trim().toLowerCase() || body.subdomain?.trim().toLowerCase() || '';
  const adminName = body.admin_full_name?.trim() || '';
  const adminEmail = body.admin_email?.trim().toLowerCase() || '';
  const password = body.password || '';
  const passwordConfirmation = body.password_confirmation || '';
  const acceptedTerms = body.accept_terms === true;

  if (!organisationName) return error('Organisation or council name is required.');
  const subdomainError = validateSubdomain(slug);
  if (subdomainError) return error(subdomainError);
  if (!adminName) return error('Admin full name is required.');
  if (!adminEmail || !adminEmail.includes('@')) return error('A valid admin email address is required.');
  if (password !== passwordConfirmation) return error('Password confirmation does not match.');

  const passwordError = validateBootstrapPassword(password);
  if (passwordError) return error(passwordError);
  if (!acceptedTerms) return error('You must confirm the terms acknowledgement to continue.');

  const sql = getDb(env);

  const existingTenant = await sql`
    SELECT id
    FROM tenants
    WHERE slug = ${slug}
       OR subdomain = ${slug}
    LIMIT 1
  `;
  if (existingTenant.length > 0) return error('That council subdomain is already in use.', 409);

  const existingUser = await sql`
    SELECT id
    FROM users
    WHERE email = ${adminEmail}
    LIMIT 1
  `;
  if (existingUser.length > 0) return error('A staff user with that email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const rawBootstrapToken = generateBootstrapToken();
  const bootstrapTokenHash = await hashBootstrapToken(rawBootstrapToken);
  const defaults = buildTenantDefaults(organisationName, adminName, adminEmail);

  const rows = await sql`
    WITH new_tenant AS (
      INSERT INTO tenants (
        name,
        slug,
        subdomain,
        status,
        contact_name,
        contact_email,
        activated_at,
        trial_ends_at
      )
      VALUES (
        ${organisationName},
        ${slug},
        ${slug},
        'active',
        ${adminName},
        ${adminEmail},
        NOW(),
        NOW() + INTERVAL '30 days'
      )
      RETURNING id, name, slug, subdomain, status, created_at
    ),
    new_user AS (
      INSERT INTO users (
        email,
        username,
        password_hash,
        full_name,
        is_platform_admin
      )
      VALUES (
        ${adminEmail},
        ${adminEmail},
        ${passwordHash},
        ${adminName},
        false
      )
      RETURNING id, email, username, full_name
    ),
    new_membership AS (
      INSERT INTO memberships (tenant_id, user_id, role)
      SELECT nt.id, nu.id, 'tenant_admin'
      FROM new_tenant nt
      CROSS JOIN new_user nu
      RETURNING tenant_id, user_id
    ),
    new_limits AS (
      INSERT INTO tenant_limits (tenant_id, max_staff_users, max_applications)
      SELECT id, 20, 200
      FROM new_tenant
      RETURNING tenant_id
    ),
    enabled_premises AS (
      INSERT INTO tenant_enabled_application_types (tenant_id, application_type_id)
      SELECT nt.id, at.id
      FROM new_tenant nt
      INNER JOIN application_types at
        ON at.slug = 'premises_licence'
       AND at.is_active = true
      RETURNING tenant_id
    ),
    new_settings AS (
      INSERT INTO tenant_settings (
        tenant_id,
        bootstrap_admin_user_id,
        council_display_name,
        support_email,
        support_contact_name,
        internal_admin_name,
        internal_admin_email,
        welcome_text,
        public_homepage_text,
        contact_us_text
      )
      SELECT
        nt.id,
        nu.id,
        ${defaults.councilDisplayName},
        ${defaults.supportEmail},
        ${defaults.supportContactName},
        ${defaults.internalAdminName},
        ${defaults.internalAdminEmail},
        ${defaults.welcomeText},
        ${defaults.publicHomepageText},
        ${defaults.contactUsText}
      FROM new_tenant nt
      CROSS JOIN new_user nu
      RETURNING tenant_id
    ),
    new_sso AS (
      INSERT INTO tenant_sso_configs (tenant_id)
      SELECT id
      FROM new_tenant
      RETURNING tenant_id
    ),
    new_bootstrap_token AS (
      INSERT INTO tenant_bootstrap_tokens (
        tenant_id,
        user_id,
        token_hash,
        purpose,
        expires_at
      )
      SELECT
        nt.id,
        nu.id,
        ${bootstrapTokenHash},
        'tenant_admin_bootstrap',
        NOW() + INTERVAL '15 minutes'
      FROM new_tenant nt
      CROSS JOIN new_user nu
      RETURNING tenant_id
    )
    SELECT
      nt.id AS tenant_id,
      nt.name AS tenant_name,
      nt.slug AS tenant_slug,
      nt.subdomain AS tenant_subdomain,
      nu.id AS user_id,
      nu.email AS user_email,
      nu.username AS user_username,
      nu.full_name AS user_full_name
    FROM new_tenant nt
    CROSS JOIN new_user nu
  `;

  const created = rows[0];

  await writeAuditLog(sql, {
    tenantId: null,
    actorType: 'system',
    actorId: null,
    action: 'tenant.self_service_provisioned',
    recordType: 'tenant',
    recordId: created.tenant_id,
    meta: {
      organisation_name: organisationName,
      subdomain: slug,
      admin_email: adminEmail,
      exception_type: 'demo_self_service_bootstrap',
    },
  });

  await writeAuditLog(sql, {
    tenantId: created.tenant_id,
    actorType: 'tenant_admin',
    actorId: created.user_id,
    action: 'tenant_admin.bootstrap_issued',
    recordType: 'user',
    recordId: created.user_id,
    meta: {
      email: created.user_email,
      username: created.user_username,
      issued_via: 'apex_self_service_signup',
    },
  });

  return json({
    tenant: {
      id: created.tenant_id,
      name: created.tenant_name,
      slug: created.tenant_slug,
      subdomain: created.tenant_subdomain,
      hostname: `${created.tenant_subdomain}.zanflo.com`,
    },
    admin: {
      id: created.user_id,
      email: created.user_email,
      full_name: created.user_full_name,
      username: created.user_username,
    },
    bootstrap_redirect: `https://${created.tenant_subdomain}.zanflo.com/admin/bootstrap?token=${rawBootstrapToken}`,
  }, 201);
}

async function login(request, env) {
  if (!isPlatformHost(request)) return error('Not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const identifier = body.identifier?.trim() || body.email?.trim() || '';
  const { password } = body;
  if (!identifier || !password) {
    return error('Email address and password are required');
  }

  const ip = getClientIp(request);
  const normIdentifier = identifier.toLowerCase();

  const { limited, reason } = await checkLoginRateLimit(env.RATE_LIMIT, ip, normIdentifier, 'platform');
  if (limited) return error(reason, 429);

  const sql = getDb(env);
  const rows = await sql`
    SELECT id, email, username, full_name, password_hash, is_platform_admin
    FROM users
    WHERE is_platform_admin = true
      AND (
        email = ${normIdentifier}
        OR LOWER(COALESCE(username, '')) = ${normIdentifier}
      )
    LIMIT 1
  `;

  if (rows.length === 0) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normIdentifier, 'platform');
    return error('Invalid credentials', 401);
  }
  const user = rows[0];

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordFailedLogin(env.RATE_LIMIT, ip, normIdentifier, 'platform');
    return error('Invalid credentials', 401);
  }

  await clearEmailRateLimit(env.RATE_LIMIT, normIdentifier, 'platform');

  const token = await signSession({
    user_id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    is_platform_admin: true,
    tenant_id: null,
    tenant_slug: null,
    role: null,
  }, env.JWT_SECRET);

  return json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      is_platform_admin: true,
    },
  }, 200, {
    'Set-Cookie': buildCookie(token),
  });
}

async function logout(request) {
  if (!isPlatformHost(request)) return error('Not found', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
    },
  });
}

async function me(request, env) {
  if (!isPlatformHost(request)) return error('Not found', 404);

  const session = await requirePlatformAdmin(request, env);
  if (!session) return error('Not authenticated', 401);

  return json({ session });
}

export async function handlePlatformAuthRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  // Public council lookup — used by self-serve signup, no auth required.
  // Only available on the apex host to prevent misuse from tenant subdomains.
  if (method === 'GET' && url.pathname === '/api/council-lookup') {
    if (!isApexHost(request)) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return handleCouncilLookup(url.searchParams.get('postcode'));
  }

  if (method === 'POST' && url.pathname === '/api/platform/signup') return signup(request, env);
  if (method === 'POST' && url.pathname === '/api/platform/login') return login(request, env);
  if (method === 'POST' && url.pathname === '/api/platform/logout') return logout(request);
  if (method === 'GET' && url.pathname === '/api/platform/me') return me(request, env);

  return null;
}
