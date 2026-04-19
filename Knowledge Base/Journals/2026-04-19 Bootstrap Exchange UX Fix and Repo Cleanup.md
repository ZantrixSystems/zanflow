# 2026-04-19 Bootstrap Exchange UX Fix and Repo Cleanup

Confidence Level: High

---

## Changes Made

### 1. Bootstrap exchange loading screen — two bugs fixed

**Symptoms reported:**
- Loading screen displayed for less than 4 seconds instead of the intended 7
- User landed on Settings after workspace creation instead of Dashboard

**Root causes identified:**

1. The `useEffect` cleanup function was calling `clearTimeout(minTimer)` when App.jsx briefly unmounted the component during its tenant availability re-check. This cancelled the 7-second minimum timer early.

2. `useSearchParams()` from React Router was used to read the token. This is a reactive value and can be unstable across render cycles; combined with the cleanup issue it caused unpredictable timer behaviour.

3. The navigate target used `navigate()` from React Router, which triggered App.jsx's tenant availability check again, creating a re-mount/unmount loop.

**Fix applied (`TenantBootstrapExchangePage.jsx`):**
- Token now read directly from `window.location.search` (stable, no React dependency)
- Cleanup function removed intentionally — the timers must not be cancelled on success; the component unmounting mid-progress should not abort the user's visible experience
- Navigation on success uses `window.location.replace()` not React Router `navigate()`
- Redirect target is always `/admin/dashboard` (removed the conditional `?welcome=1` variant as unnecessary complexity)
- `started` ref guard retained to prevent React StrictMode double-invocation consuming the single-use token

### 2. Signup page loading state

**Fix applied (`ApexCouncilSignupPage.jsx`):**
- `setSaving(false)` was in a `finally` block, running on both success and failure
- Moved to `catch` only — on success the button stays disabled while the browser navigates away, preventing a flash back to the enabled form state

---

## Orphaned Files Removed

| File | Reason |
|------|--------|
| `src/routes/auth.js` | Superseded by `applicant-auth.js` and `staff-auth.js`. Exported `handleAuthRoutes` for `/api/auth/*` paths but never imported in `src/index.js`. Doctrine explicitly marks these paths as not part of the active MVP route model. |
| `frontend/src/assets/react.svg` | Vite scaffold default, never referenced in any JSX |
| `frontend/src/assets/vite.svg` | Vite scaffold default, never referenced in any JSX |
| `docs/session-log-2026-04-19.md` | External AI agent session log, not a doctrine or journal. Not part of the KB structure. |
| `scripts/seed.js` | Older single-tenant seed script superseded by `scripts/seed-dev-data.js` (two tenants, richer fixture data) |
| `{`, `{,+`, `0)` (root) | Junk files created when `git -c core.editor="true" rebase --continue` misfired during conflict resolution. Were accidentally committed and have now been removed. |
| `./request('POST'` (root) | Same cause — second junk file from the same rebase incident |

---

## Doctrine Updated

`TENANT_BOOTSTRAP_AND_ADMIN_ONBOARDING.md` — added four rules documenting the bootstrap exchange UX behaviour: minimum display time, token reading strategy, navigation method, and final landing page.

---

## Breaking Changes

None. All changes are frontend UX only. No API contracts, schema, or auth models were modified.
