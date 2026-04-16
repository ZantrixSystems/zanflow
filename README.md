# Licensing Platform

A multi-tenant SaaS platform for councils and similar public-sector organisations to manage licence applications end-to-end.

## What It Does

**For the public:**
- Submit licence applications online
- Upload supporting documents
- Receive email updates on application progress
- Respond to requests for additional information

**For staff:**
- Review and process incoming applications
- Request additional information from applicants
- Record decisions with full audit trail
- Manage applications across the full workflow

**For platform administrators:**
- Onboard and manage council tenants
- Manage platform-level configuration

## Architecture

```
frontend/           React SPA — applicant portal and staff dashboard
src/                Backend API — Cloudflare Workers (business logic, auth, routing)
migrations/         Postgres schema migrations (sequential, numbered)
Knowledge Base/     Architecture doctrine and decision journals
docs/               Planning, roadmap, and reference documents
.github/            GitHub config and AI assistant instructions
```

Key design decisions:

- **Multi-tenant by design** — tenant_id on every main table, enforced in every query
- **Modular monolith** — no microservices
- **Fixed workflow** — application states are defined in code, not a dynamic engine
- **Secure by default** — all auth and validation enforced in the backend Worker
- **Audit-first** — every mutation is logged with actor, timestamp, and change
- **Application-layer encryption spike** — selected sensitive fields can be encrypted server-side before storage; this is not full database-at-rest CMEK

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React (Vite) |
| Backend | Cloudflare Workers |
| Database | Neon (Postgres) |
| Storage | Object storage (S3-compatible) |
| Email | Transactional email service |

## Application Workflow States

```
submitted -> under_review -> awaiting_info -> approved
                          -> rejected
```

## Roles

| Role | Scope | Description |
|------|-------|-------------|
| platform_admin | Platform | Manages tenants and platform config |
| tenant_admin | Council | Manages users and settings within a council |
| officer | Council | Reviews and processes applications |
| applicant | Public | Submits and tracks their own applications |

## Roadmap

See [docs/roadmap/00_PLATFORM_HIGH_LEVEL_ROADMAP.md](docs/roadmap/00_PLATFORM_HIGH_LEVEL_ROADMAP.md)

## Development

Backend:
```bash
npx wrangler dev
```

Reset the dev database to a fresh state:
```bash
npm run reset:dev-db
```

Recreate the internal Riverside test tenant if needed later:
```bash
npm run seed
```

Apply pending schema changes:
```bash
npm run migrate
```

Additional backend secrets for the current encryption spike:
```bash
GOOGLE_KMS_KEY_NAME=projects/.../locations/.../keyRings/.../cryptoKeys/...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Frontend:
```bash
npm --prefix frontend run dev
```

Deploy:
```bash
npm run deploy
```
