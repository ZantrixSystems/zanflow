# Case Management Platform Model

## Purpose

Define the confirmed platform model for ZanFlo as a **council licensing case management system**.

This document records the intended domain model, actor journeys, and structural constraints that all future work must respect.

---

## Confirmed Platform Model

### 1. Resident Account

- A resident (applicant) creates one account per council tenant
- Accounts are scoped to a single tenant — the same person may have accounts with different councils
- Account identity (name, email) is locked into application records at submission for legal traceability

### 2. Premises Linked to Resident Account

- A resident can link one or more premises to their account
- Premises are tenant-scoped and applicant-scoped — they cannot be shared across accounts
- Each premises has an address, description, and a verification state machine

### 3. Premises Verification (First Case Type)

- Adding a premises does not automatically entitle an applicant to apply for licences
- The applicant must submit the premises for council verification
- An officer reviews whether the premises should be verified against that resident account
- Verification state machine: `unverified → pending_verification → verified / verification_refused / more_information_required`
- If refused or information is required, the applicant responds; the cycle repeats until verified or abandoned
- Premises verification events are recorded in `premises_verification_events` as an immutable domain event log

### 4. Downstream Applications Against Premises

- An applicant **cannot** create an application without a verified premises
- Every application must be created against a specific premises record
- A premises can have multiple applications of different types against it
- Applications carry a snapshot of the premises details at submission for legal traceability, independent of later edits

#### MVP Application Types

- **Premises Licence** — Application under the Licensing Act 2003
- **Late Night Refreshment** — Permission to sell hot food or drink between 11pm and 5am

**Removed:** Provisional Statement (specialist type, outside MVP scope — does not follow standard premises-based verification model)

### 5. Officer Case View

- Officers work from a **unified case management queue**
- The queue surfaces both:
  - Premises verification cases
  - Licence application cases
- Officers navigate from queue → case detail for either case type
- On an application detail, officers can see the linked premises record and its current verification state
- Officers can see the applicant account behind each case
- Officers can follow links between an application and its premises verification case

### 6. Resident View

- The resident dashboard is **premises-first**
- Each premises is shown as a primary card, with its verification status visible
- Applications linked to each premises are shown nested under that premises
- Residents can see the overall status of each premises and each application
- From any premises card, a resident can start a new application (if the premises is verified)
- Guidance notices are shown inline per premises to guide next steps (unverified, pending, info required, refused)

---

## Structured Filtering System

The structured filtering system is a **core design direction** for the officer case management experience.

### Design Principles

- One unified case table across both case types
- All filter state lives in URL query params — views are bookmarkable and shareable
- Filters are AND-combined only (no OR / query language in MVP)
- Saved filters are per-user, stored server-side in `saved_filters`, and rendered as sidebar nav items
- Sort is always present alongside filters

### Minimum Filter Set (officer queue)

| Filter key   | Values                                        |
|-------------|-----------------------------------------------|
| `case_type` | `application`, `premises_verification`        |
| `status`    | Application statuses + PV verification states |
| `assigned`  | `mine`, `unassigned`                          |
| `type`      | Application type slug                         |
| `created_days` | 7, 14, 30, 90                              |
| `sort`      | `updated`, `created`, `type`, `status`        |

### Minimum Column Set (officer queue)

| Column         | Source                         |
|---------------|--------------------------------|
| Case ref       | `ref_number` or `pv_ref`       |
| Case type      | `case_type` + `type_name`      |
| Premises       | `premises_name` + `postcode`   |
| Status         | `case_status`                  |
| Assigned to    | `assigned_user_name`           |
| Applicant      | `applicant_name`               |
| Updated        | `case_updated_at`              |
| Created        | `case_created_at`              |

### Saved Filters

- Users can save the current URL filter state as a named view
- Saved filters appear as sidebar nav items for quick access
- At most one saved filter may be marked as default per user per tenant
- Allowed filter keys: `status`, `assigned`, `case_type`, `type`, `created_days`, `sort`

---

## Application Type Architecture

- Platform-level catalogue: `application_types` — no tenant_id
- Tenant enablement: `tenant_enabled_application_types` bridges types to tenants
- Per-tenant versioning: `application_type_versions` — tenants publish and retire versions independently
- Applications snapshot the `application_type_version_id` at creation — historic records remain stable when versions are retired
- `review_mode` column is present on versions for future manager-signoff enforcement (not active in MVP)

### Future Direction (deferred)

- Tenant admin can create additional application types in the platform catalogue
- Application types will eventually support tenant-configurable fields, labels, and help text
- The schema is structured to support this: `tenant_application_field_settings` already exists as a foundation
- **Do not build the full dynamic form builder in this phase**

---

## Explicit Non-Goals (MVP)

- Configurable workflow engine — states are fixed in code
- Dynamic form builder — fields are hardcoded per application type
- Cross-tenant applicant identity
- Cross-premises application sharing
- Provisional Statement application type (removed from MVP)
- Manager-signoff enforcement (`review_mode` deferred)

---

## Key Tables

| Table                               | Purpose                                       |
|-------------------------------------|-----------------------------------------------|
| `applicant_accounts`                | Tenant-scoped resident accounts               |
| `premises`                          | Resident-owned premises, one per address      |
| `premises_verification_events`      | Immutable domain event log for PV lifecycle   |
| `applications`                      | Licence applications against verified premises |
| `decisions`                         | Immutable decision records per application    |
| `application_types`                 | Platform-level catalogue of licence types     |
| `tenant_enabled_application_types`  | Which types each tenant has enabled           |
| `application_type_versions`         | Per-tenant version publishing model           |
| `saved_filters`                     | Per-user saved queue filter views             |

---

## External Authority Sharing

Officers and managers may create a temporary read-only external share link for a premise licence case.

Rules:

- Links are bearer access tokens and must be treated as confidential
- Only a token hash is stored server-side
- Raw links are shown only when created
- Links expire automatically, with a maximum lifetime of 30 days
- Officers may revoke or extend an active link, but extension remains capped at 30 days from the extension action
- Creating a new link for the same case revokes any previous active link for that case
- Each link records the intended authority, purpose, creator, expiry, selected sections, view count, and last viewed timestamp
- External viewers do not need an account
- External views are read-only and show only the selected sections
- Internal notes, audit logs, assignment details, staff-only events, and hidden review data are never exposed
- Every create, revoke, extend, and view is audited

Initial supported share sections:

- case summary
- premises details
- applicant details
- selected licence sections and answers

Documents are intentionally excluded from the first slice.

---

*Last updated: 2026-04-29*
