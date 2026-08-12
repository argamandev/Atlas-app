# Verification — speaker-edit admin gate (branch `fix/speaker-edit-admin-gate`)

Ticket 12 of the smart-layer map, founder decisions 2026-08-13 (`DECISIONS.md`): speaker
attribution is corpus curation, **admin-only**; rename propagation into saved quotes is a
feature once gated; the live hole is fixed now.

## What changed

- `src/lib/auth.ts` — new shared `requireAdmin(req)`: resolves the caller (cookie or bearer),
  401 with no user, 403 unless `profiles.role === 'admin'`, null when allowed.
- `PATCH /api/transcripts/[id]/speakers` and `PATCH .../diarization` — both now delegate:
  `const denied = await requireAdmin(req); if (denied) return denied`. Previously any
  signed-in user passed.
- `src/lib/curationAuthz.test.ts` (registered in `npm test`) — structural guard: every listed
  curation route must import and delegate to `requireAdmin`; pins the one-handler-per-file
  premise. Exists because `apiAuthBoundary.test.ts` proves a user was *resolved*, not that the
  right user was *allowed* — the exact gap these routes fell through.
- `LiveTranscriptView` — new `isAdmin` prop gates `canEdit`, so non-admins never see an edit
  affordance that can only 403 (UI-truthfulness law); threaded from `getCurrentUser()` in
  `/app/live/[id]`, the company period page, and through `LiveSession` for the live→finished
  swap. `renameSpeaker` now checks `res.ok` — a refused write can no longer toast "saved".

## What was verified, and what each check actually measured (M1)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | 702/702 green (includes the 2 new curation-authz tests; over-budget always-on set fixed by the STATUS.md rewrite this branch carries — the regression predated the branch) |
| Anonymous `PATCH …/speakers` (curl, no cookies) | **401** |
| Anonymous `PATCH …/diarization` (curl, no cookies) | **401** |
| Admin (founder's signed-in Chrome, `sagi.arg`, role verified `admin` by live query) `PATCH …/speakers` with empty body | **400** "speakerId and name required" — past the gate, refused by validation, no write performed |
| Same probe on `…/diarization` | **400** "fromWord, toWord and speakerId required" — same shape |
| `/app/live/2gXp90F8s6w` rendered as admin | Page renders (Hebrew RTL, Knesset-hearing transcript); edit pencil **visible**; edit mode toggles; zero console errors after hard reload |

## Stated limits — what was NOT verified

- **The non-admin 403 and hidden-pencil states were not driven in a browser.** The three
  non-admin accounts are real users' accounts; no credential exists for a test non-admin
  session, and minting one (magic link / new prod user) was ruled out. The 403 branch is
  two lines in `requireAdmin` (read by hand); the hidden pencil is `canEdit`'s
  `(isAdmin ?? false) &&` prefix with `isAdmin` absent/false by default. First real
  non-admin visit should confirm the pencil is gone — founder can check from any of the
  three non-admin accounts in seconds.
- No locale A/B: the change adds zero user-visible strings; the affordance is unchanged for
  admins and absent for others. (Post-review, the two edit handlers now surface failures as
  `dict.common.error` — an existing localized string — and 401 as a sign-in redirect.)
- Ordering (gate before side effects) is by reading the routes: `requireAdmin` is the first
  statement in both handlers.

## Review round 1 (2026-08-13) — CHANGES, all four findings fixed

Verdict filed verbatim in `review.md` beside this file. What each finding changed:

1. **BLOCKER (law overstated its test):** the gate's decision is now a pure function,
   `curationVerdict` in `src/lib/auth/curation.ts`, and `curationAuthz.test.ts` executes every
   branch — including non-admin → forbidden → 403 — plus the 401/403 status mapping.
   `docs/DATA-MODEL.md`'s enforcement sentence rewritten to claim exactly the delivered
   mechanism (behavioral on the decision, structural on the delegation, IO seam by hand).
2. **WARNING (PUT owner bypass):** recorded in `docs/open-findings.md` with the 2026-08-13
   ownership query (3 admin-owned rows, 2 ownerless → nothing exposed today) and the founder
   decision it waits on; cross-referenced from the DATA-MODEL law.
3. **WARNING (401 dead-end toast, RECURRENCE yes → error-path law):** both edit handlers now
   send an expired session to `loginRedirectTarget` and toast `dict.common.error` otherwise
   (no raw English). The law bought its stronger mechanism in the same commit:
   `src/lib/apiFetchDiscipline.test.ts` — every direct `/api` fetch must read `.ok`/`.status`
   or be counted in a per-file ratchet with a reason; proven able to go red by mutation
   (planted uninspected fetch → fail; removed → green). `app.md`'s declaration moved
   none → partially(test).
4. **NIT (trailing-comment blind spot):** `stripComments` now also strips trailing `//`
   comments on quote-free lines; the residue is stated in the comment.
