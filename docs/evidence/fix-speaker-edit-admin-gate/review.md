# Cold review — `fix/speaker-edit-admin-gate` (atlas-reviewer, 2026-08-13)

Two rounds. Round 1 returned CHANGES (four findings, all fixed — see
`2026-08-13-verification.md` for what each changed); round 2 re-reviewed the fixed branch.
Round 2's verdict, verbatim, is the record of note. Round 2's one NIT was applied on the
branch exactly as the finding prescribed (the stated-limits line), before merge.

## Round 2 — verdict (verbatim)

VERDICT: APPROVED

FINDING · NIT · src/lib/apiFetchDiscipline.test.ts:88 · The per-line `FETCH_SITE` regex cannot see a call whose `/api` literal is line-wrapped onto the line after `fetch(`, and the test's otherwise thorough STATED LIMITS block names the variable-URL blind spot but not this one — add it to the stated limits (or make the scan window-based) so the mechanism's self-description stays exactly true.
RECURRENCE: no

Re-review notes (not gate grammar) — every round-1 finding verified fixed, with my own eyes where it counted:

- **BLOCKER closed.** `curationVerdict` (`src/lib/auth/curation.ts`) is pure and fail-closed (`null`/missing/garbage/`'Admin'` role → `forbidden`, no user → `unauthorized` even with a claimed admin role); `curationAuthz.test.ts` now executes every branch including the exact branch the live defect lived in, plus the 401/403 mapping; `requireAdmin` preserves fail-closed behavior through the refactor (query error → `role` undefined → forbidden). `docs/DATA-MODEL.md:44` now claims precisely the delivered mechanism and honestly names the IO seam as structural-only. The law no longer overstates its enforcement.
- **PUT bypass recorded, correctly.** `docs/open-findings.md` entry with the 2026-08-13 ownership query (3 admin-owned, 2 ownerless → no non-admin holds the PUT today), the founder decision it waits on, and a cross-reference from the DATA-MODEL law — filed as an open finding, not cited as a law.
- **Error-path recurrence obligation met.** Both edit handlers send a 401 to `loginRedirectTarget` (signature matches `src/lib/auth/gate.ts:52`; gate.ts is pure, safe in a client bundle) and toast localized `dict.common.error` otherwise. The law moved prose → test in the same commit: I mutation-verified `apiFetchDiscipline.test.ts` myself — planted an uninspected `fetch('/api/…')`, the test went red naming the planted file and line; removed it, green again; working tree left clean. `app.md`'s declaration none → partially with an honest scope statement ("proves the response is LOOKED AT, nothing more").
- **NIT closed** — `stripComments` strips trailing comments on quote-free lines, residue stated.
- Independently confirmed on head `a226da3`: 705/705 battery green (includes the always-on budget test, so the app.md growth fits), `tsc --noEmit` clean, `git status` clean.

The one new NIT does not block; it can ride a follow-up commit or the next touch of that file.

## Round 1 — verdict (verbatim, superseded by round 2)

VERDICT: CHANGES

FINDING · BLOCKER · docs/DATA-MODEL.md:44 · The written law claims "each curation route carries its own non-admin → 403 test" (and the ticket's q4 resolution ordered "route tests asserting non-admin → 403"), but no such test exists — `curationAuthz.test.ts` proves only the delegation shape, and the 403 branch of `requireAdmin` has never executed anywhere (no unit test, no non-admin curl, no browser check), so merging as-is enshrines a law that overstates its own enforcement, the exact defect ADR-0002 exists to prevent; either add a behavioral 403 test (extracting the role check into a pure testable function is one cheap shape) or correct the law's enforcement sentence in this same branch, and state the choice in the evidence file.
RECURRENCE: no
FINDING · WARNING · src/app/api/transcripts/[id]/route.ts:88 · `PUT /api/transcripts/[id]` still lets a non-admin row OWNER rewrite the entire `formatted_data` — every speaker name and line's `speakerId` on a shared-corpus transcript all users see — which is a standing route around the new admin-only curation law (the incoherence the ticket itself flagged), and it is recorded nowhere as an open bypass; it needs a line in `docs/open-findings.md` or ticket 13, not silence.
RECURRENCE: no
FINDING · WARNING · src/components/live/LiveTranscriptView.tsx:300 · On a 401/403 the new `res.ok` check toasts the server's raw English string (`unauthorized` / `Forbidden`) in a Hebrew UI with no path to sign-in, whereas the error-path law prescribes reverting state or routing an expired session to `loginRedirectTarget` — degradation is now visible (good) but the 401 answer is a dead-end.
RECURRENCE: yes → Gating an endpoint changes every caller's ERROR path
FINDING · NIT · src/lib/curationAuthz.test.ts:41 · `stripComments` removes only full-line `//` comments, so a trailing comment containing the delegation shape would satisfy all three positive matches — the test's own "prose cannot satisfy the check" claim is slightly overstated.
RECURRENCE: no
