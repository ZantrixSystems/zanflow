# 2026-04-23 Staff MFA TOTP

**Phase:** 6 - MVP Stabilisation  
**Confidence Level:** High  
**Scope:** MFA hardening after security review

- Added migration `0031_add_totp_to_users.sql` to store encrypted TOTP secrets and the MFA enabled flag on `users`
- Added Worker-side TOTP generation, verification, and AES-GCM secret encryption in `src/lib/totp.js`
- Added staff MFA routes for enrol, confirm, verify, and disable in `src/routes/staff-mfa.js`
- Updated staff login so password-auth users with MFA enabled receive a short-lived `mfa_pending` cookie and must complete a second TOTP step before the full session cookie is issued
- Updated the staff profile modal to show MFA status and support enrol, confirm, and disable actions
- Kept MFA setup local to the app and did not use a third-party QR service because that would leak the shared secret outside the platform

---

## Security hardening follow-up

- Enforced the CSRF header check on authenticated MFA enrol, confirm, disable, and verify routes so MFA state changes now follow the same mutating-request rule as the rest of the backend
- Added server-side rate limiting for TOTP confirm, disable, and verify flows using the existing Cloudflare KV binding
- Extended the platform admin login flow so `platform_admin` accounts with TOTP enabled now receive the same short-lived `mfa_pending` cookie and second-step challenge before a full session is issued
- Added `/api/platform/mfa/verify` so platform admin MFA completion follows the same hardened verification path and audit model
- Added a production guard so the demo self-service tenant signup path is off by default unless `ALLOW_SELF_SERVICE_SIGNUP=true` is set explicitly
- Added integration coverage for platform-admin MFA challenge behaviour and MFA CSRF rejection

## Verification

- `node --check` passed for:
  - `src/lib/rate-limit.js`
  - `src/routes/staff-mfa.js`
  - `src/routes/platform-auth.js`
  - `tests/integration/slice1-auth-foundation.test.js`
- `npm test` could not be completed in the refreshed repo because `.dev.vars` is missing, so the integration suite fails during test env bootstrap before reaching runtime assertions

## Architectural decisions

- **Platform admin MFA now matches staff MFA.**  
  A platform-scoped admin account is higher risk than a tenant-scoped account, so password-only login is no longer considered acceptable when TOTP is enabled.

- **Demo self-service signup is treated as a production exception, not a default platform capability.**  
  The runtime now requires an explicit production opt-in so the demo onboarding path cannot remain exposed by accident.

- **MFA endpoints now follow the same CSRF rule as other authenticated mutations.**  
  This keeps the backend security model consistent instead of treating MFA routes as a special case.

## Breaking decisions

- `platform_admin` users with TOTP enabled no longer receive a full session directly from `/api/platform/login`; they must complete the MFA verify step first
- Production self-service signup now requires explicit enablement via `ALLOW_SELF_SERVICE_SIGNUP=true`
