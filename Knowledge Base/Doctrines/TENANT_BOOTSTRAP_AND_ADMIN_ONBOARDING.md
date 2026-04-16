# Tenant Bootstrap And Admin Onboarding

## Purpose

Define the intended behaviour for self-serve creation of the first tenant admin account on the platform apex.

## Rules

- The apex host `zanflo.com` is for platform-level tenant bootstrap, not applicant sign-up
- The first self-serve account is the tenant's break-glass admin account
- The break-glass account uses local username/email + password auth even if SSO is enabled later
- Self-serve signup creates a tenant in `pending_verification`, not a fully live tenant
- Pending tenants must not resolve through normal tenant portal routes until moved into an allowed live state
- The initial tenant admin lands in a platform-managed onboarding/settings area
- Additional future staff access is stored as tenant-scoped role assignments by email
- Role assignments must use existing tenant roles only: `tenant_admin`, `manager`, `officer`
- `platform_admin` remains a separate platform-scoped concern
- Pending self-serve tenants have a 30-day activation window
- Nightly cleanup removes pending tenants that were never activated within that window

## Activation Model

- `pending_verification` means the tenant exists for bootstrap only
- Completing bootstrap moves the tenant to `trial`
- `trial` and `active` are allowed tenant portal states
- Cleanup applies only to `pending_verification` tenants whose activation window has expired

## SSO Direction

- SSO is a later capability, not a prerequisite for the first admin account
- Future SSO mapping must bind users to tenant-scoped role assignments by email
- The break-glass local admin path must remain available even after SSO is added
