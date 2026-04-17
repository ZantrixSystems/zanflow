# 2026-04-17 Staff Queue Tenant Admin And Manual Onboarding

Confidence Level: High

## Summary

Implemented MVP slices 8 to 11 on top of the previously hardened host-based runtime:

- tenant staff review queue under `/admin`
- decision workflow with decision records and audited transitions
- tenant admin users, settings, and audit views
- platform manual tenant onboarding and initial tenant admin issuance

## Backend

- Added tenant staff/admin routes for:
  - `GET /api/admin/applications`
  - `GET /api/admin/applications/:id`
  - `POST /api/admin/applications/:id/assign`
  - `POST /api/admin/applications/:id/request-information`
  - `POST /api/admin/applications/:id/decision`
  - `GET /api/admin/users`
  - `POST /api/admin/users`
  - `PUT /api/admin/users/:id`
  - `GET /api/admin/settings`
  - `PUT /api/admin/settings`
  - `GET /api/admin/audit`
- Kept tenant scope enforcement at the backend query level using the resolved tenant from staff session context.
- Kept audit writes on all mutations in these slices.
- Reused platform admin routes for manual onboarding and kept them platform-host gated only.

## Database

- Added `0014_add_application_assignment.sql`
  - application assignment fields and indexes
- Added `0015_create_decisions.sql`
  - fixed decisions table for approve/refuse/request-information records
- Added `0016_expand_application_submission_constraint.sql`
  - allows applicant resubmission after `awaiting_information`

## Frontend

- Added tenant admin workspace pages:
  - dashboard
  - applications list
  - application detail
  - users
  - settings
  - audit
- Added platform admin pages:
  - tenant list
  - tenant create
  - tenant detail
  - initial tenant admin issue
- Updated host-aware frontend routing so active runtime now matches:
  - `zanflo.com`
  - `platform.zanflo.com`
  - `<tenant>.zanflo.com`
  - `<tenant>.zanflo.com/admin`
- Updated applicant application page so `awaiting_information` can be edited and resubmitted.

## Verification

- `npm --prefix frontend run build` passed
- `npm test` passed
- Confirmed self-service tenant onboarding remains out of the active runtime path
- Confirmed manual tenant onboarding remains the MVP route

## Final Verification Pass

- Rechecked workflow transitions, audit coverage, tenant isolation, and runtime hygiene against the roadmap-aligned MVP model.
- Tightened review-queue permissions so `tenant_admin` no longer processes applications directly.
- Tightened assignment so an officer cannot take an application already assigned to a different officer; manager reassignment remains allowed.
- Extended integration coverage for those permission boundaries.
- Re-ran:
  - `npm test`
  - `npm --prefix frontend run build`

---

## Demo Exception - Self-Service Tenant Provisioning Vertical Slice

Confidence Level: High

Phase: 5 - MVP Build with explicit demo exception recorded against the roadmap

Reason:

- the active demo requirement now needs a council to self-provision from the apex site
- leaving manual onboarding as the only working path would have blocked the requested Riverside demo
- the exception has been recorded in doctrine and roadmap notes to avoid silent drift

What changed:

- replaced apex manual-onboarding copy with a self-service council signup journey
- added `POST /api/platform/signup` on the apex host
- added one-time tenant bootstrap exchange on `POST /api/staff/bootstrap-exchange`
- added tenant setup persistence for:
  - organisation details
  - branding and public homepage copy
  - tenant-scoped SSO configuration
- added tenant public config route:
  - `GET /api/tenant/public-config`
- added tenant bootstrap/session support without sharing cookies across subdomains
- updated platform admin views to show bootstrap owner details for provisioned tenants

Data model changes:

- added `0017_tenant_settings_sso_and_bootstrap_tokens.sql`
- new tables:
  - `tenant_settings`
  - `tenant_sso_configs`
  - `tenant_bootstrap_tokens`

Truthfulness notes:

- live SSO sign-in is still not implemented
- SSO settings now persist safely, with OIDC client secrets encrypted before storage when `SECRET_ENCRYPTION_KEY` is configured
- redirect URI and logout URI guidance are shown, but no redirect/callback identity flow is claimed as working yet

Verification:

- `npm run migrate`
- `npm test`
- `npm --prefix frontend run build`

Known deployment requirement:

- wildcard tenant host routing now needs Cloudflare custom domain coverage for `*.zanflo.com` in addition to the apex host

---

## First-Run Tenant Admin Handoff UX Fix

Confidence Level: High

Reason:

- after saving the council setup workspace, a new tenant admin was left on the settings page without a clear next step
- this created avoidable friction in the first-run council admin journey

What changed:

- updated the tenant admin settings page so first-run saves now guide the user forward
- after save, the page now shows clear next-step actions:
  - `Go to admin dashboard`
  - `Open public council site`
- when the page is opened in first-run mode via `?setup=1`, a successful save now redirects to `/admin/dashboard` after a short delay

Verification:

- `npm --prefix frontend run build`

Update:

- reused the new stacked action-row pattern beyond the council admin dashboard
- applied it to the tenant public homepage action area so applicants now see clearer row-based actions with direct buttons for:
  - create account
  - start
  - sign in or open dashboard
- deliberately left the apex marketing homepage in its existing marketing layout so informational content still reads like a landing page rather than an admin menu

Alignment refinement:

- tightened the action-row layout so buttons now sit on a fixed right-hand action rail
- normalised action button widths so rows line up cleanly even when button labels differ
- applied that lock-up to both the tenant admin dashboard and the tenant public portal action rows

---

## Tenant Admin And Applicant Navigation Consistency Pass

Confidence Level: High

Reason:

- the core journey was working, but navigation across the tenant admin and applicant-facing pages was uneven
- some pages had no obvious route back to the main council admin area or the public council homepage
- the demo now depends on a smoother end-to-end journey for both council staff and applicants

What changed:

- added a shared breadcrumb and section-navigation pattern inside the main frontend layout
- applied consistent council admin navigation across:
  - dashboard
  - settings
  - users
  - audit
  - applications
  - application detail
- applied consistent applicant navigation across:
  - tenant public homepage
  - start application
  - applicant dashboard
  - application detail
- added simple return links on:
  - applicant sign-in
  - applicant registration
  - tenant staff/admin sign-in
- added direct settings-page actions back to:
  - admin dashboard
  - public council site

Scope:

- frontend-only navigation and UX pass
- no backend behaviour or permissions changed in this slice

Verification:

- `npm --prefix frontend run build`
