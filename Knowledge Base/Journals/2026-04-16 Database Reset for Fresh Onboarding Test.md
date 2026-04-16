# 2026-04-16 Database Reset for Fresh Onboarding Test

**Confidence Level: High**
**Phase: 5.5 - Tenant Foundation (controlled extension)**
**Scope: Safe dev database reset path for fresh platform onboarding tests**

---

## Why this work fits the current phase

This supports the current Phase 5.5 tenant foundation work without building ahead:

- the platform apex onboarding flow now exists
- repeated clean-slate testing is needed
- resetting dev data should not require manual SQL each time

This is a development utility only.
It does not change tenant architecture or production behaviour.

---

## What changed

Added a dedicated script:

- `scripts/reset-dev-db.js`

This script:

- loads the dev database connection from `.dev.vars`
- requires an explicit `--confirm-reset` flag
- truncates tenant and test data in a single transaction
- preserves schema migrations and platform catalogue rows in `application_types`
- clears prior onboarding requests so the apex signup path can be re-tested cleanly

Added npm command:

- `npm run reset:dev-db`

Updated `README.md` with the reset and reseed commands.

---

## Reset scope

The reset clears:

- `tenants`
- `tenant_limits`
- `users`
- `memberships`
- `applicant_accounts`
- `applications`
- `tenant_enabled_application_types`
- `audit_logs`
- `tenant_onboarding_requests`

The reset preserves:

- schema
- `_migrations`
- `application_types`

---

## Operational note

After reset, tenant-specific applicant or staff login flows will not work until a tenant is created again.

This is intentional for a true clean start.
The platform landing page onboarding request flow at `zanflo.com` should still work.
