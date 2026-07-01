# LEGACY.md — what's left of Timlul (Wave 2 only)

> **Wave 1 is DONE (2026-07-02):** the legacy Timlul product (routes `/home /dashboard /companies
> /processing /transcript` + its component folders) was deleted from this repo — verified with
> `tsc` + 45 tests + `next build` + a real live-call test. Login now lands on `/app/home`.
> Everything below is the **only** legacy left.

## 🗑️ Wave 2 — the login gateway (delete only AFTER Atlas has its own login/landing)

These 4 files currently gate access to Atlas, so they stay until replaced:

- **Route:** `src/app/page.tsx` (the `/` login/landing)
- **Components:** `src/components/auth/LoginForm.tsx`, `src/components/auth/JoinForm.tsx`,
  `src/components/ui/dotted-surface.tsx`
- **Then:** `src/components/auth/` and `src/components/ui/` will be empty → delete both folders,
  delete this file, and remove the gateway rows from `ARCHITECTURE.md`.

**Prerequisite:** build Atlas's own login + landing (planned work — likely arrives with the
Claude Design frontend import).

**How to spot them:** each file starts with `// ⚠️ GATEWAY (legacy-styled) …`.

## Pre-deletion checklist (Wave 2)

1. Atlas login/landing is live and tested (users can actually sign in without the gateway).
2. `npm test` green — incl. the boundary guard (`src/lib/legacyBoundary.test.ts`).
3. `npx tsc --noEmit` clean after removing the files.
4. Update the post-login redirect if it changes, and re-test sign-in end-to-end.
