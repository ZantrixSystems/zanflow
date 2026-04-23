# 2026-04-23 Staff MFA TOTP

Confidence Level: Medium

- Added migration `0031_add_totp_to_users.sql` to store encrypted TOTP secrets and the MFA enabled flag on `users`
- Added Worker-side TOTP generation, verification, and AES-GCM secret encryption in `src/lib/totp.js`
- Added staff MFA routes for enrol, confirm, verify, and disable in `src/routes/staff-mfa.js`
- Updated staff login so password-auth users with MFA enabled receive a short-lived `mfa_pending` cookie and must complete a second TOTP step before the full session cookie is issued
- Updated the staff profile modal to show MFA status and support enrol, confirm, and disable actions
- Kept MFA setup local to the app and did not use a third-party QR service because that would leak the shared secret outside the platform
