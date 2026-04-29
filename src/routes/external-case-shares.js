import { getDb } from '../db/client.js';
import { requireTenantStaffWithPermissions, hasPermission } from '../lib/guards.js';
import { writeAuditLog } from '../lib/audit.js';

const MAX_EXPIRY_DAYS = 30;

const SECTION_DEFS = [
  { key: 'case_summary', label: 'Case summary' },
  { key: 'premises', label: 'Premises details' },
  { key: 'applicant', label: 'Applicant details' },
  { key: 'licence_sections', label: 'Selected licence sections and answers' },
];

const SECTION_LABELS = Object.fromEntries(SECTION_DEFS.map((section) => [section.key, section.label]));
const ALLOWED_SECTION_KEYS = new Set(SECTION_DEFS.map((section) => section.key));

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseExpiryDays(value) {
  const days = value === undefined || value === null || value === '' ? MAX_EXPIRY_DAYS : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) return null;
  return days;
}

function normaliseSections(value) {
  const sections = Array.isArray(value) ? value : [];
  const clean = [...new Set(sections.map((section) => String(section).trim()).filter(Boolean))];
  if (clean.length === 0) return null;
  if (clean.some((section) => !ALLOWED_SECTION_KEYS.has(section))) return null;
  return clean;
}

function sectionSummary(keys) {
  return keys.map((key) => ({ key, label: SECTION_LABELS[key] ?? key }));
}

function parseSectionKeys(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function publicUrlFor(request, token) {
  const url = new URL(request.url);
  return `${url.origin}/external/case-share/${token}`;
}

async function loadCase(sql, tenantId, caseId) {
  const rows = await sql`
    SELECT
      c.*,
      aa.full_name AS applicant_name,
      aa.email AS applicant_email,
      u.full_name AS assigned_user_name,
      t.name AS tenant_name,
      t.slug AS tenant_slug
    FROM premise_licence_cases c
    INNER JOIN applicant_accounts aa ON aa.id = c.applicant_account_id AND aa.tenant_id = c.tenant_id
    LEFT JOIN users u ON u.id = c.assigned_user_id
    INNER JOIN tenants t ON t.id = c.tenant_id
    WHERE c.tenant_id = ${tenantId}
      AND c.id = ${caseId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadSections(sql, tenantId, caseId, allowedSections) {
  if (!allowedSections.includes('licence_sections')) return [];

  return sql`
    SELECT
      css.id,
      css.section_slug,
      css.answers,
      lsd.name AS section_name,
      lsd.description AS section_description,
      lsd.fields AS section_fields
    FROM case_selected_sections css
    INNER JOIN licence_section_definitions lsd ON lsd.id = css.section_definition_id
    WHERE css.tenant_id = ${tenantId}
      AND css.case_id = ${caseId}
    ORDER BY lsd.display_order ASC, lsd.name ASC
  `;
}

function buildSharedCasePayload(row, allowedSections) {
  const shared = {};

  if (allowedSections.includes('case_summary')) {
    shared.case_summary = {
      ref_number: row.ref_number,
      status: row.status,
      submitted_at: row.submitted_at,
      last_modified_at: row.last_modified_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  if (allowedSections.includes('premises')) {
    shared.premises = {
      premises_name: row.premises_name,
      address_line_1: row.address_line_1,
      address_line_2: row.address_line_2,
      town_or_city: row.town_or_city,
      postcode: row.postcode,
      premises_description: row.premises_description,
    };
  }

  if (allowedSections.includes('applicant')) {
    shared.applicant = {
      name: row.applicant_name,
      email: row.applicant_email,
    };
  }

  return shared;
}

function serialiseShare(row, includeUrl = null) {
  const allowedSections = parseSectionKeys(row.allowed_sections);
  return {
    id: row.id,
    authority_name: row.authority_name,
    contact_name: row.contact_name,
    purpose: row.purpose,
    allowed_sections: allowedSections,
    allowed_section_summary: sectionSummary(allowedSections),
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    first_viewed_at: row.first_viewed_at,
    last_viewed_at: row.last_viewed_at,
    view_count: row.view_count,
    created_by_name: row.created_by_name,
    is_active: !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
    ...(includeUrl ? { share_url: includeUrl } : {}),
  };
}

async function listShares(request, env, caseId) {
  const session = await requireTenantStaffWithPermissions(request, env, 'officer', 'manager', 'tenant_admin');
  if (!session) return error('Not authorised', 403);
  if (!hasPermission(session, 'cases.view')) return error('Not authorised', 403);

  const sql = getDb(env);
  const plc = await loadCase(sql, session.tenant_id, caseId);
  if (!plc) return error('Case not found', 404);

  const rows = await sql`
    SELECT s.*, u.full_name AS created_by_name
    FROM external_case_shares s
    INNER JOIN users u ON u.id = s.created_by_user_id
    WHERE s.tenant_id = ${session.tenant_id}
      AND s.case_id = ${caseId}
    ORDER BY s.created_at DESC
  `;

  return json({
    available_sections: SECTION_DEFS,
    shares: rows.map((row) => serialiseShare(row)),
  });
}

async function createShare(request, env, caseId) {
  const session = await requireTenantStaffWithPermissions(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);
  if (!hasPermission(session, 'cases.view')) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const authorityName = body.authority_name?.trim();
  if (!authorityName) return error('authority_name is required');
  if (authorityName.length > 160) return error('authority_name must be 160 characters or fewer');

  const contactName = body.contact_name?.trim() || null;
  const purpose = body.purpose?.trim() || null;
  const expiryDays = parseExpiryDays(body.expiry_days);
  if (!expiryDays) return error('expiry_days must be between 1 and 30');

  const allowedSections = normaliseSections(body.allowed_sections);
  if (!allowedSections) return error('allowed_sections must include at least one valid section');

  const sql = getDb(env);
  const plc = await loadCase(sql, session.tenant_id, caseId);
  if (!plc) return error('Case not found', 404);
  if (plc.status === 'draft') return error('Draft cases cannot be shared externally', 409);

  const token = generateToken();
  const tokenHash = await hashToken(token);

  const inserted = await sql`
    INSERT INTO external_case_shares (
      tenant_id,
      case_id,
      authority_name,
      contact_name,
      purpose,
      allowed_sections,
      token_hash,
      expires_at,
      created_by_user_id
    )
    VALUES (
      ${session.tenant_id},
      ${caseId},
      ${authorityName},
      ${contactName},
      ${purpose},
      ${JSON.stringify(allowedSections)}::jsonb,
      ${tokenHash},
      NOW() + (${expiryDays}::int * INTERVAL '1 day'),
      ${session.user_id}
    )
    RETURNING *
  `;
  const share = inserted[0];

  const replaced = await sql`
    UPDATE external_case_shares
    SET
      revoked_at = NOW(),
      revoked_by_user_id = ${session.user_id},
      replaced_by_share_id = ${share.id},
      updated_at = NOW()
    WHERE tenant_id = ${session.tenant_id}
      AND case_id = ${caseId}
      AND id <> ${share.id}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `;

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: session.role,
    actorId: session.user_id,
    action: 'external_case_share.created',
    recordType: 'premise_licence_case',
    recordId: caseId,
    meta: {
      share_id: share.id,
      authority_name: authorityName,
      purpose,
      allowed_sections: allowedSections,
      expires_at: share.expires_at,
      replaced_share_ids: replaced.map((row) => row.id),
    },
  });

  return json({
    share: serialiseShare({ ...share, created_by_name: session.full_name }, publicUrlFor(request, token)),
  }, 201);
}

async function revokeShare(request, env, caseId, shareId) {
  const session = await requireTenantStaffWithPermissions(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);
  if (!hasPermission(session, 'cases.view')) return error('Not authorised', 403);

  const sql = getDb(env);
  const plc = await loadCase(sql, session.tenant_id, caseId);
  if (!plc) return error('Case not found', 404);

  const rows = await sql`
    UPDATE external_case_shares
    SET
      revoked_at = COALESCE(revoked_at, NOW()),
      revoked_by_user_id = COALESCE(revoked_by_user_id, ${session.user_id}),
      updated_at = NOW()
    WHERE tenant_id = ${session.tenant_id}
      AND case_id = ${caseId}
      AND id = ${shareId}
    RETURNING *
  `;
  if (rows.length === 0) return error('Share link not found', 404);

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: session.role,
    actorId: session.user_id,
    action: 'external_case_share.revoked',
    recordType: 'premise_licence_case',
    recordId: caseId,
    meta: { share_id: shareId },
  });

  return json({ share: serialiseShare({ ...rows[0], created_by_name: null }) });
}

async function extendShare(request, env, caseId, shareId) {
  const session = await requireTenantStaffWithPermissions(request, env, 'officer', 'manager');
  if (!session) return error('Not authorised', 403);
  if (!hasPermission(session, 'cases.view')) return error('Not authorised', 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const expiryDays = parseExpiryDays(body.expiry_days);
  if (!expiryDays) return error('expiry_days must be between 1 and 30');

  const sql = getDb(env);
  const rows = await sql`
    UPDATE external_case_shares
    SET
      expires_at = NOW() + (${expiryDays}::int * INTERVAL '1 day'),
      updated_at = NOW()
    WHERE tenant_id = ${session.tenant_id}
      AND case_id = ${caseId}
      AND id = ${shareId}
      AND revoked_at IS NULL
    RETURNING *
  `;
  if (rows.length === 0) return error('Active share link not found', 404);

  await writeAuditLog(sql, {
    tenantId: session.tenant_id,
    actorType: session.role,
    actorId: session.user_id,
    action: 'external_case_share.extended',
    recordType: 'premise_licence_case',
    recordId: caseId,
    meta: { share_id: shareId, expires_at: rows[0].expires_at },
  });

  return json({ share: serialiseShare({ ...rows[0], created_by_name: null }) });
}

async function getPublicShare(request, env, token) {
  if (!token || token.length < 32) return error('Share link not found or expired', 404);

  const tokenHash = await hashToken(token);
  const sql = getDb(env);

  const rows = await sql`
    SELECT
      s.*,
      c.ref_number,
      c.status,
      c.premises_name,
      c.address_line_1,
      c.address_line_2,
      c.town_or_city,
      c.postcode,
      c.premises_description,
      c.submitted_at,
      c.last_modified_at,
      c.created_at AS case_created_at,
      c.updated_at AS case_updated_at,
      aa.full_name AS applicant_name,
      aa.email AS applicant_email,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      u.full_name AS created_by_name
    FROM external_case_shares s
    INNER JOIN premise_licence_cases c ON c.id = s.case_id AND c.tenant_id = s.tenant_id
    INNER JOIN applicant_accounts aa ON aa.id = c.applicant_account_id AND aa.tenant_id = c.tenant_id
    INNER JOIN tenants t ON t.id = s.tenant_id
    INNER JOIN users u ON u.id = s.created_by_user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  const share = rows[0];
  if (!share) return error('Share link not found or expired', 404);

  const allowedSections = parseSectionKeys(share.allowed_sections);
  const sections = await loadSections(sql, share.tenant_id, share.case_id, allowedSections);

  await sql`
    UPDATE external_case_shares
    SET
      first_viewed_at = COALESCE(first_viewed_at, NOW()),
      last_viewed_at = NOW(),
      view_count = view_count + 1,
      updated_at = NOW()
    WHERE id = ${share.id}
      AND tenant_id = ${share.tenant_id}
  `;

  await writeAuditLog(sql, {
    tenantId: share.tenant_id,
    actorType: 'system',
    actorId: null,
    action: 'external_case_share.viewed',
    recordType: 'premise_licence_case',
    recordId: share.case_id,
    meta: {
      share_id: share.id,
      authority_name: share.authority_name,
    },
  });

  return json({
    share: {
      authority_name: share.authority_name,
      contact_name: share.contact_name,
      purpose: share.purpose,
      expires_at: share.expires_at,
      created_at: share.created_at,
      created_by_name: share.created_by_name,
      allowed_sections: allowedSections,
      allowed_section_summary: sectionSummary(allowedSections),
      tenant_name: share.tenant_name,
    },
    case: buildSharedCasePayload({
      ...share,
      created_at: share.case_created_at,
      updated_at: share.case_updated_at,
    }, allowedSections),
    sections,
  });
}

export async function handleExternalCaseShareRoutes(request, env) {
  const url = new URL(request.url);
  const { method } = request;

  const publicMatch = url.pathname.match(/^\/api\/external\/case-shares\/([^/]+)$/);
  if (publicMatch && method === 'GET') {
    return getPublicShare(request, env, publicMatch[1]);
  }

  const listMatch = url.pathname.match(/^\/api\/admin\/premise-cases\/([^/]+)\/external-shares$/);
  if (listMatch && method === 'GET') {
    return listShares(request, env, listMatch[1]);
  }
  if (listMatch && method === 'POST') {
    return createShare(request, env, listMatch[1]);
  }

  const actionMatch = url.pathname.match(/^\/api\/admin\/premise-cases\/([^/]+)\/external-shares\/([^/]+)\/([^/]+)$/);
  if (actionMatch && method === 'POST') {
    const [, caseId, shareId, action] = actionMatch;
    if (action === 'revoke') return revokeShare(request, env, caseId, shareId);
    if (action === 'extend') return extendShare(request, env, caseId, shareId);
  }

  return null;
}
