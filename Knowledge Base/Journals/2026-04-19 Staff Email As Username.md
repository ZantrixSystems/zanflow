# 2026-04-19 Staff Email As Username

**Confidence Level: High**
**Phase: 5.5 - Tenant Foundation (explicit extension)**
**Scope: Remove separate staff username entry and use email as the login identifier**

---

## Why this work fits the current phase

This change stays inside the active tenant foundation and user management work:

- the issue was in live staff account creation and staff sign-in
- no workflow states, tenant boundaries, or platform versus tenant role rules changed
- the fix reduces operator friction without weakening backend auth checks

---

## What changed

Staff users now use their email address as the single local-auth identifier.

Updated:

- tenant admin user creation so new staff accounts automatically store `username = email`
- manual platform-issued tenant admin creation so it follows the same rule
- self-service council bootstrap admin creation so the bootstrap account also uses the full email address
- tenant and platform sign-in wording so the UI asks for email address rather than email-or-username
- tenant admin user management UI so it no longer asks for a separate username
- database rules so existing staff rows are backfilled to `username = lower(email)` and future rows cannot drift away from that

Migration added:

- `migrations/0019_staff_email_as_username.sql`

---

## Risks and notes

- this is a schema-affecting auth change, so the new migration must be applied before relying on the new behaviour in an existing environment
- login query support for `username` remains in place for compatibility, but runtime intent is now email-first only
- no tenant isolation rules changed; staff lookup remains tenant-scoped through memberships on tenant hosts
