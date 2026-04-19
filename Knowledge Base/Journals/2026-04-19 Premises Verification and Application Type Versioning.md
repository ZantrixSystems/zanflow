# 2026-04-19 Premises Verification and Application Type Versioning

**Phase:** 5 — MVP Build
**Confidence Level:** High

---

## Summary

Delivered a substantial domain model reframe separating premises ownership verification from licence application approval. This was not a cosmetic refactor — the original coupling was architecturally incorrect and would have caused compliance and UX problems at scale.

---

## Key Design Decisions

### 1. Premises and applications are separate lifecycles

**Decision:** Premises is a first-class entity with its own state machine. Verification of an applicant's claim to a premises is not the same thing as approval of a licence application.

**Why:** A premises can be reused across many applications over time. The question "does this person control this site?" must be answered once, independently of any specific licence request. Mixing them would prevent reuse, corrupt the audit trail, and confuse officers.

**Breaking change risk:** None for existing data. `verification_state` column added with a safe default of `unverified` on all existing rows.

---

### 2. Application type versioning: version-on-publish, retire-don't-mutate

**Decision:** Created `application_type_versions` as a per-tenant, per-type immutable publishing record. Applications snapshot the version ID at creation. Retiring a version never changes historical application records.

**Why:** Public-sector audit compliance requires that a 3-year-old application can always be read against the type definition it was submitted under. Editing a live type in place would silently alter what historical records appear to reference.

**Table:** `application_type_versions` with `publication_status` (draft / published / retired), `review_mode`, and optional `name_override` / `description_override` per tenant.

**Partial unique index:** `WHERE publication_status = 'published'` enforces only one published version per tenant+type at database level — not just application logic.

---

### 3. Verified premises gate enforced at backend

**Decision:** `POST /api/applications` now rejects creation if the premises `verification_state` is not `verified`. This is a backend check — the frontend also filters, but the database is the source of truth.

**Why:** Frontend-only gates are not security. An applicant using the API directly (or a buggy client) must be stopped at the handler.

---

### 4. review_mode column added for future manager-signoff support

**Decision:** `application_type_versions.review_mode` exists as `single_officer | manager_signoff_required`. The column is live. Full manager-confirmation UI flow is deferred.

**Why:** Adding the column now means the schema does not need to change when this feature is built. The lifecycle states already support it naturally.

**Deferred:** Manager confirmation UI, SLA timers, delegation rules.

---

### 5. Premises verification events: separate domain event log

**Decision:** Created `premises_verification_events` table rather than relying solely on `audit_logs`.

**Why:** `audit_logs` is a generic mutation log. The verification journey is a legal record with domain meaning — the event types, the actor roles, and the progression matter independently of generic audit. Officers and applicants can read their own verification history clearly.

---

## Migrations Delivered

| Migration | Purpose |
|-----------|---------|
| `0020` | `premises.verification_state` column, `premises_verification_events` table, `application_type_versions` table, `applications.application_type_version_id` FK, backfill existing records |
| `0021` | Seed "Late Night Refreshment" platform application type, enable for active tenants, create published version |

---

## Backend Changes

| File | Change |
|------|--------|
| `src/routes/premises.js` | Added `verification_state` to all responses; new `POST /api/premises/:id/submit-verification` endpoint; editing a pending premises resets state to `unverified` |
| `src/routes/admin-premises-verifications.js` | New file — staff queue, detail, and decision endpoints |
| `src/routes/applications.js` | Enforces `verified` gate; captures `application_type_version_id` at creation |
| `src/routes/application-types.js` | Now serves from `application_type_versions`, not `tenant_enabled_application_types` |
| `src/routes/admin-application-types.js` | New file — tenant admin publish/retire flows |
| `src/index.js` | Wired new route handlers |

---

## Frontend Changes

| File | Change |
|------|--------|
| `PremisesListPage.jsx` | Shows verification state badge; Start application CTA gated on `verified` |
| `PremisesFormPage.jsx` | Full verification state panel; submit-for-verification CTA; verification event history |
| `TenantApplyPage.jsx` | Only shows verified premises in the selector; explains next steps for unverified |
| `AdminPremisesVerificationPage.jsx` | New — list and detail pages for staff |
| `AdminApplicationTypesPage.jsx` | New — tenant admin publish/retire UI with optional overrides |
| `App.jsx` | New routes for the above pages |
| `navigation.js` | Premises verifications and Application types added to staff nav |
| `api.js` | New API methods for all new endpoints |
| `index.css` | Verification state status tag CSS; `.alert-info` class |

---

## What Is Explicitly Deferred

- Manager sign-off confirmation UI (column exists, enforcement deferred)
- Address/postcode/business lookup integration (schema designed to accept it without migration)
- Configurable workflow engine (explicitly not built — fixed states remain)
- Payments, SMS, reporting

---

## Risks and Notes

- Existing applications without `application_type_version_id` are backfilled by migration 0020. After this migration the column can be made NOT NULL in a future migration once clean data is confirmed.
- The `tenant_enabled_application_types` table is still populated (by the publish flow) for backward compatibility with any code that may read it. Over time this table can be retired in favour of `application_type_versions` alone.
- Premises edited while in `pending_verification` state resets to `unverified` — this is intentional to prevent bait-and-switch submissions. This behaviour is noted in audit logs.
