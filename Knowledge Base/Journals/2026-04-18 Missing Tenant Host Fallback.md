Confidence Level: High

## Summary

Added a tenant-host fallback in the static frontend shell so deleted or unknown tenant subdomains do not present a blank page.

## Reason

- the wildcard tenant host still served the SPA shell even when the tenant row no longer existed
- a Worker-level HTML fallback was not taking effect on the live asset route
- the user still saw a blank page on a deleted tenant host, which is poor demo and support behaviour

## What changed

- updated `frontend/index.html`
- removed an accidental leading `1` character before the doctype
- added a static tenant availability check in the HTML shell for tenant hosts
- the shell now calls `/api/tenant/public-config`
- when that request fails, the shell shows a plain `Tenant not found` message with a link back to `zanflo.com`

## Scope

- frontend shell fallback only
- no change to workflow, auth model, or tenant ownership rules

## Verification

- `npm --prefix frontend run build`
- `npm run deploy`

## Truthfulness note

- the live wildcard host may still serve the SPA shell itself first
- this change makes the user-visible behaviour safe and understandable even in that hosting mode
