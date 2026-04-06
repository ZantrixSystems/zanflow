# Copilot Instructions - Multi-Tenant SaaS Licensing Platform

You are working on a multi-tenant SaaS licensing platform for councils and similar public-sector organisations.

## Key Principles

- Multi-tenant from day one (tenant_id everywhere, enforced in every query)
- Modular monolith (do NOT split into microservices)
- Strong audit logging for all mutations
- Role-based access control (platform + tenant roles)
- Secure by default (all validation and auth enforced server-side)

## What This Platform Does

- Public users submit licence applications online
- Staff review and process applications
- Staff can request additional information from applicants
- Applications move through a fixed set of workflow states
- Decisions are recorded with full audit trail
- Applicants receive email notifications at key points
- Multiple tenant organisations (councils) operate independently on one platform

## Architecture

- Frontend: React (Vite)
- Backend: Cloudflare Workers
- Database: Neon (Postgres)
- Storage: Object storage (S3-compatible, not DB)
- Email: Transactional email service (e.g. Resend)

## Coding Expectations

- Keep backend logic explicit and readable
- Always enforce tenant isolation in queries
- Never expose data across tenant boundaries
- Validate all inputs server-side
- Prefer simple over clever

## Data Rules

- Every main table must include: id, tenant_id, created_at, updated_at
- Never store documents in Postgres
- Always design for reporting and audit from the start

## Roles

- platform_admin: manages tenants and platform configuration
- tenant_admin: manages users and settings within a council
- officer: reviews and processes applications
- applicant: public user who submits applications

## Security

- Enforce role checks in the backend handler, not the frontend
- No sensitive data in browser storage
- Use server-issued secure cookies for sessions

## Application Workflow (Fixed - Do Not Build a Workflow Engine)

States:
- submitted
- under_review
- awaiting_info
- approved
- rejected

## When Unsure

- Choose the simplest maintainable option
- Ask before making breaking changes
