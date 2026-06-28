# LEGACY.md — the Timlul deletion manifest

> **Purpose:** the legacy תמלול/**Timlul** product (the original root-route app) is kept alive only
> while a few early users still need it (~through 2026-07), then **deleted** so Atlas is the whole
> product. This file is the exact, safe recipe for that deletion — what to remove, what to keep, and
> in what order. A build-enforced guard test (`src/lib/legacyBoundary.test.ts`) guarantees Atlas
> never depends on anything in the delete-set, so deletion stays a one-pass, zero-risk operation.

**How to spot legacy in the code:** every legacy file starts with a banner —
`// ⚠️ LEGACY (Timlul) …` (the product, deletable) or `// ⚠️ GATEWAY (legacy-styled) …`
(the login front door, keep until Atlas has its own).

---

## ✅ KEEP — shared, NOT part of Timlul (never delete these)

- **All backend:** `src/app/api/**`, `src/lib/**` (db, api, live, chat, transcription, i18n, etc.),
  `src/middleware.ts`, `supabase/**`. Atlas runs on these.
- **All Atlas frontend:** routes `src/app/app/**`; components `src/components/{ds,app,live,chat,company,calendar}`.
- **The login gateway (for now):** see Wave 2 — keep until Atlas ships its own login/landing.

## 🗑️ Wave 1 — the legacy product (deletable now; decouple already done)

Delete these whenever we decide Timlul is no longer needed. Nothing in Atlas imports them.

**Routes (`src/app/`):** `home/`, `dashboard/`, `companies/`, `processing/`, `transcript/`
**Components (`src/components/`):** `landing/`, `dashboard/`, `transcript/`, `processing/`,
`companies/` (plural — the legacy list; Atlas uses singular `company/`), `platform/`,
`layout/`, and `ui/Button.tsx` + `ui/Badge.tsx`.

## 🗑️ Wave 2 — the login gateway (delete only AFTER Atlas has its own login/landing)

These currently gate access to Atlas, so they must outlive Wave 1 until replaced:

**Route:** `src/app/page.tsx` (the `/` login/landing)
**Components:** `src/components/auth/` (`LoginForm`, `JoinForm`), `src/components/ui/dotted-surface.tsx`
**Then:** the `src/components/ui/` folder will be empty → delete it too.

**Prerequisite for Wave 2:** build Atlas's own login + landing (a separate, planned piece of work).

---

## Pre-deletion checklist (run before each wave)

1. `npm test` is green — including the boundary guard (proves Atlas has no legacy imports).
2. `npx tsc --noEmit` is clean after removing the files (no dangling imports).
3. **Backend orphan audit:** grep `src/app/api` + `src/lib` for endpoints/helpers used *only* by the
   deleted routes (e.g. anything only the old dashboard called). Delete those too, or confirm Atlas
   uses them. (Frontend deletion never touches the DB / RLS / auth — no data risk.)
4. Remove the deleted routes from `src/middleware.ts` matchers if any are listed explicitly.
5. After Wave 2: delete this gateway section and update `ARCHITECTURE.md`.

## Security note

Deleting legacy **shrinks** the attack surface (fewer live routes/endpoints) — it's a security win.
The only deletion risks are removing shared backend or leaving an orphaned legacy-only endpoint;
both are covered by the KEEP list + step 3 above.
