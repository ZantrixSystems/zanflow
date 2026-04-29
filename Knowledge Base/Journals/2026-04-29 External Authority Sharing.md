# 2026-04-29 External Authority Sharing

## Work Performed

- Added the external authority share-link design for premise licence cases.
- Added database support for temporary read-only external case share links.
- Added backend routes to create, list, revoke, extend, and resolve share links.
- Added staff UI on the active case detail page for granular section sharing.
- Added public read-only external share page.
- Added integration coverage for link creation, public access, replacement, revocation, and audit.
- Updated the case management doctrine with the external sharing rules.

## Decision

External authority access is implemented as a temporary bearer link, not as a magic-login flow.

The token is generated once, shown once, and only a SHA-256 hash is stored. Creating a new link for a case revokes any previous active link for that case.

## Security Notes

- Maximum expiry is 30 days.
- Links are read-only.
- Links are granular by section.
- Documents are excluded from the first slice.
- Internal notes, audit logs, staff-only events, assignments, and hidden review data are excluded.
- Link create, view, revoke, and extend actions are audited.

## Confidence Level

High

