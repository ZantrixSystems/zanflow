# 2026-04-20 Council Signup — GOV.UK Postcode Lookup

**Phase:** 5 — MVP Build  
**Confidence Level:** High

---

## Summary

Replaced the freehand council name field on the public council signup page (`/signup`) with a GOV.UK Local Authorities API postcode lookup. Councils now find themselves from the official register rather than typing their name. The existing provisioning and bootstrap flow is unchanged.

Also extracted the GOV.UK proxy logic into a shared lib so it is reused by both the public signup endpoint and the platform admin tenant-create endpoint.

---

## Changes

### New file — `src/lib/council-lookup.js`

Shared GOV.UK proxy logic extracted here. Previously inlined in `platform-admin.js`, now used by both routes. Same error contract as before:

- `kind: "validation"` — bad postcode format, postcode not found
- `kind: "service"` — timeout, network failure, unexpected status or shape

### `src/routes/platform-auth.js`

- Added import for `handleCouncilLookup`
- Added `GET /api/council-lookup` — public, apex-host-only, no session required
- Used by the public signup page

### `src/routes/platform-admin.js`

- Replaced the inlined council-lookup implementation with a 4-line wrapper that calls `handleCouncilLookup` from the shared lib
- Auth guard preserved (platform admin session still required for this endpoint)

### `frontend/src/api.js`

- Added `publicCouncilLookup(postcode)` → `GET /api/council-lookup`
- Existing `councilLookup(postcode)` → `GET /api/platform/council-lookup` (platform admin) unchanged

### `frontend/src/pages/ApexCouncilSignupPage.jsx`

Full rewrite. Two-step flow:

**Step 1 — Find your council**
- Postcode input + "Find my council" button
- Single match → auto-confirm and advance
- Multiple matches → user picks from list
- Validation error (bad postcode, not found) → inline error, stays on step 1
- Service error (GOV API down) → warning banner, advances to step 2 with manual council name field

**Step 2 — Create your admin account**
- Confirmed council shown in success banner with "Change" escape hatch
- Subdomain preview: `{slug}.zanflo.com`
- Freehand council name input only shown in service-error fallback mode
- Remaining fields unchanged: admin name, email, password, confirm, terms checkbox
- Submit → `POST /api/platform/signup` (unchanged backend)
- On success → `window.location.href = data.bootstrap_redirect` → existing bootstrap loading screen → dashboard

---

## Architectural decisions

**Public endpoint at `/api/council-lookup`, not `/api/platform/council-lookup`.**  
The signup page is unauthenticated. The platform-admin endpoint requires a session. These are two different routes sharing one implementation via the lib.

**Apex-host restriction on public endpoint.**  
`isApexHost` check ensures the public lookup can only be called from `zanflo.com`, not from a tenant subdomain. Prevents misuse from tenant contexts.

**Slug derived from GOV authority slug, passed to backend.**  
The `subdomain_slug` sent to `/api/platform/signup` is now the GOV authority slug (e.g. `westminster`) rather than a slugified version of the typed name. More canonical and consistent. Backend uniqueness check still applies.

**Manual fallback only on service error.**  
GOV API downtime degrades gracefully to manual entry. Invalid/unknown postcodes show a validation error — they do not offer manual fallback, which would allow garbage data through.

---

## Risks

- GOV API is unversioned and may change shape. The `kind: "service"` path protects against this.
- Manual fallback (service error path) allows any council name to be typed. This is intentional — it's a last resort and platform admin can correct it later.
- Slug derived from GOV authority name could still clash with existing slugs — backend 409 uniqueness check remains the authority.
