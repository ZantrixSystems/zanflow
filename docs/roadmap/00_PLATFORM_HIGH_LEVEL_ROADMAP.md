# Platform High Level Roadmap

Multi-tenant SaaS licensing platform for councils and public-sector organisations.

---

## Phase 0 — Orientation

**Goal:** Establish the repository, architecture doctrine, tooling, and working conventions before any design or build work begins.

Deliverables:
- Repository structure initialised
- AI assistant instruction files in place (CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions.md)
- Knowledge Base structure ready (Doctrines + Journals)
- Tech stack confirmed
- Development environment verified

---

## Phase 1 — MVP Service Design

**Goal:** Define what the MVP must do and for whom, before touching schema or code.

Deliverables:
- Core user journeys mapped (applicant, officer, tenant admin, platform admin)
- Application workflow states confirmed (fixed, not configurable)
- Notification touchpoints identified (which emails, at which states)
- Document upload requirements defined
- Scope boundary drawn clearly — what is in and out of MVP

---

## Phase 2 — Domain Data Design

**Goal:** Produce a stable, production-safe schema before writing application code.

Deliverables:
- Core tables designed (tenants, users, applications, licences, documents, audit_log)
- Multi-tenancy constraints confirmed (tenant_id on all main tables)
- Audit log table designed
- Document storage strategy confirmed (object storage, not Postgres)
- Initial migration files written and reviewed

---

## Phase 3 — System Architecture

**Goal:** Lock down backend structure, API shape, and auth model before building.

Deliverables:
- Worker routing structure defined
- Session and cookie auth model confirmed
- Role-based access control model documented (platform_admin, tenant_admin, officer, applicant)
- API contract shape defined (request/response patterns)
- Email integration approach confirmed
- Caching strategy documented

---

## Phase 4 — Delivery Planning

**Goal:** Break the build into clear, sequenced units of work with defined acceptance criteria.

Deliverables:
- Build sequence agreed (what gets built in what order)
- Per-feature acceptance criteria defined
- Known risks documented
- Environment and deployment approach confirmed

---

## Phase 5 — MVP Build

**Goal:** Implement the core platform to the agreed MVP scope.

Build sequence (indicative):
- Tenant management (platform level)
- User management and authentication
- Application submission flow (public)
- Application review workflow (staff)
- Information request flow (staff to applicant)
- Decision recording
- Email notifications at key workflow transitions
- Document upload and retrieval
- Audit log on all mutations

---

## Phase 6 — MVP Stabilisation

**Goal:** Harden the system before any real tenants are onboarded.

Deliverables:
- Security review (auth, permissions, tenant isolation, input validation)
- Performance review (query plans, indexing, caching)
- Error handling and observability
- End-to-end testing of all key journeys
- Operational runbook draft

---

## Phase 7 — Post-MVP Evolution

**Goal:** Extend the platform after the core is stable and proven with real users.

Candidates (not committed):
- Additional licence types and custom fields per tenant
- Reporting and data export
- Applicant-facing account portal (track history, reapply)
- Enhanced notification options (SMS)
- Configurable workflow steps (deferred from MVP)
- Multi-council onboarding tooling

---

*Detailed sprint planning lives in Knowledge Base/Journals. This roadmap is intentionally high level.*
