# Spec — Legacy (Timlul) ↔ Atlas separation & clean-deletion contract

**Date:** 2026-06-29
**Status:** approved (founder)
**Goal:** Make the legacy תמלול/Timlul product **safely deletable in one pass** — zero code or
security risk to Atlas — and keep it that way as Atlas grows.

## Background — the traced reality (not vibes)

The repo holds two frontends sharing one backend. An import trace (`@/` alias is used
consistently; a relative-import scan found nothing, so the alias graph is complete) showed the two
frontends are **already almost fully disjoint**:

- **Atlas** uses: `components/{ds,app,live,chat,company,calendar}` + routes `/app/*`.
- **Legacy** uses: `components/{landing,dashboard,transcript,processing,companies,platform,layout}` +
  `components/ui/*` + routes `/`, `/home`, `/dashboard`, `/companies`, `/processing/[id]`, `/transcript/[id]`.
- **Only ONE Atlas→legacy frontend import exists:** `app/app/settings/page.tsx` imports
  `@/components/ui/LanguageToggle`.
- **Zero legacy→Atlas imports.**
- Backend (API routes, `lib/`, pipeline, middleware, Supabase) is **shared on purpose** — stays.

**Risk read:** accidental cross-wiring is LOW (they don't mix). The real risk is **pattern
contamination** — reading a legacy file as the "how this app does it" example and copying an
outdated pattern (legacy uses `ui/*`, Atlas uses `ds/*`, with no signpost).

## Design — 5 pieces (Option A: label in place + one necessary decouple)

1. **Cut the one thread.** Move `ui/LanguageToggle` → `ds/LanguageToggle` (its correct home — a
   generic DS primitive). Update the 1 Atlas import + 1 legacy import; add to `ds/index.ts`.
   Result: **Atlas imports nothing from legacy.**
2. **Label every legacy file** with a top-of-file banner so it can never be mistaken for a pattern.
3. **Delete confirmed dead code** (`EmptyState`, `ErrorState`, `layout/DashboardSidebar`,
   `layout/DashboardTopBar`, `ui/Card`, `ui/Input`) — zero importers, all in git history.
4. **`LEGACY.md` deletion manifest** — exact delete-set vs keep-set, in two waves + pre-delete checklist.
5. **Guard test** — a unit test (in `npm test`) that **fails the build** if any Atlas file imports a
   legacy folder. Makes deletability guaranteed by the build, not by memory.

## Deletion waves (the "one button")

- **Wave 1 — the legacy product** (deletable whenever, after piece #1): routes `/home`,
  `/dashboard`, `/companies`, `/processing/[id]`, `/transcript/[id]` + folders
  `landing/`, `dashboard/`, `transcript/`, `processing/`, `companies/`, `platform/`, `layout/`,
  `ui/Button`, `ui/Badge`.
- **Wave 2 — the login gateway** (deletable once Atlas ships its own login/landing): `/`
  (`app/page.tsx`), `components/auth/`, `ui/dotted-surface`.

## Security

Deleting legacy **reduces** attack surface. The only deletion risks — removing shared backend, or
leaving an orphaned legacy-only endpoint — are handled by the manifest keep-list + a pre-delete
backend audit. Frontend deletion never touches the DB, RLS, or auth.

## Out of scope (named, not silently dropped)

- Building Atlas's own login/landing (Wave-2 prerequisite) — separate future work.
- Physically moving the legacy bulk into `src/legacy/` (Option B) — only if labels prove insufficient.

## Verification

- Run the guard test **before** the decouple → it must FAIL on the real `settings→ui/LanguageToggle`
  violation (proves the guard catches violations). Then **after** → it must PASS.
- Full `npm test` green + `tsc --noEmit` clean (catches the import move).
