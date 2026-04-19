# Tenant Bootstrap And Admin Onboarding

## Purpose

Define the intended MVP behaviour for tenant onboarding, break-glass admin issuance, and entry-point separation.

## Rules

- Manual tenant onboarding by a `platform_admin` remains the core MVP operating model
- A documented demo exception now allows self-service tenant signup from the apex host
- The demo exception must stay explicit in journals and roadmap notes; it must not be treated as silent scope drift
- The apex host `zanflo.com` remains the product site and now also hosts the demo self-service council signup entry point
- The platform host `platform.zanflo.com` is reserved for platform administration only
- Each tenant uses `<tenant>.zanflo.com` for its public applicant portal
- Tenant staff and tenant admins use `<tenant>.zanflo.com/admin`
- The first tenant admin account is a break-glass account issued during manual onboarding
- The self-service demo path also issues a break-glass tenant admin account, but the first sign-in must be exchanged onto the tenant host using a one-time bootstrap handoff rather than a shared cross-subdomain session cookie
- The break-glass account uses the staff email address plus password auth even if SSO is enabled later
- The self-service council signup password must be at least 8 characters and include at least one uppercase letter and one number; lowercase letters and symbols are optional
- Platform roles and tenant roles remain separate concerns
- Additional tenant staff access uses tenant-scoped memberships and tenant roles only
- Role assignments must use existing tenant roles only: `tenant_admin`, `manager`, `officer`
- `platform_admin` remains a separate platform-scoped concern

## Tenant Status Model

- `pending_setup` means the tenant exists in the platform but is not available to the public tenant portal
- `active` means the tenant public portal and tenant staff entry are available
- `suspended` means tenant-facing access is blocked while platform administration remains available
- `disabled` means the tenant is inactive and tenant-facing access is blocked

## Access Model

- Applicants start from the tenant public homepage and use `/apply` as the single public start route
- Applicant registration and sign-in remain tenant-scoped
- Tenant staff sign in through `/api/staff/login` and must belong to the tenant resolved from the host
- Staff local-auth sign-in uses the email address as the single identifier; the runtime must not require a separate username field
- Self-service tenant bootstrap starts on `zanflo.com`, provisions the tenant, then completes first sign-in on `<tenant>.zanflo.com/admin/bootstrap`
- Platform admins sign in through `/api/platform/login`
- Mixed `/api/auth/*` runtime paths are not part of the active MVP route model

## SSO Direction

- SSO is a later capability, not a prerequisite for issuing the first tenant admin account
- Tenant SSO settings may be captured and stored before live redirect/callback auth is implemented
- Future SSO mapping must bind users to tenant-scoped roles
- The break-glass local admin path must remain available even after SSO is added
