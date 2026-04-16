# 2026-04-16 Self-Serve Tenant Bootstrap

**Confidence Level: Medium**
**Phase: 5.5 - Tenant Foundation (explicit extension)**
**Scope: Replace apex onboarding request form with self-serve tenant admin bootstrap**

---

## Roadmap discipline note

This is an explicit extension beyond the earlier Phase 5.5 journal that deferred self-service onboarding.

Reason for the pull-forward:

- the desired MVP test path is now "create first tenant admin from the apex home page"
- the prior request-intake-only form was not operationally useful
- the new implementation still keeps platform and tenant concerns separate and keeps tenant status gating explicit

This does **not** deliver full SSO or automated email verification.

---

## What changed

### Apex flow

The platform apex no longer stores an onboarding request row.

Instead it now creates:

- a tenant in `pending_verification`
- the first local break-glass admin user
- a `tenant_admin` membership for that user
- default tenant limits
- enabled application type rows for that tenant
- an active tenant role assignment for the creator's email

The new public endpoint is:

- `POST /api/platform/signup`

It sets a staff session cookie immediately so the new admin lands in the onboarding area without a second login step.

### Break-glass admin identity

Staff users now support an optional `username`.

Staff login accepts:

- email
- or username

The first admin account is intentionally local-auth based even though SSO is expected later.

### Onboarding area

Added authenticated tenant bootstrap routes:

- `GET /api/platform/bootstrap/me`
- `PUT /api/platform/bootstrap/role-assignments`
- `POST /api/platform/bootstrap/activate`

The onboarding UI now shows:

- tenant summary
- activation countdown banner
- live members
- role assignment by email for `tenant_admin`, `manager`, `officer`
- SSO placeholder section
- explicit "complete setup and start trial" action

### Cleanup

Nightly cron now also deletes expired pending tenants that never moved out of `pending_verification`.

Cleanup removes related:

- role assignments
- applications
- applicant accounts
- tenant enabled types
- audit rows
- memberships
- orphan local users
- tenant limits
- tenant rows

---

## Important design choices

- No `super_admin` tenant role was added. Platform-wide authority remains `platform_admin`.
- Additional future staff access is stored as tenant role assignments by email rather than forcing local-user creation up front.
- Normal tenant portal resolution still allows only `trial` and `active` tenants.

---

## Known gaps still deferred

- email confirmation / verification
- password reset
- MFA
- SAML / OAuth / OIDC setup flows
- claim-based role sync from SSO
