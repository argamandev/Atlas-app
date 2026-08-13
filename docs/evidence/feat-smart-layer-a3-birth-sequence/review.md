# Review — feat/smart-layer-a3-birth-sequence

Cold review by the atlas-reviewer subagent, two rounds.

Round 1 (at 81e8b0a): APPROVED, with the apply of migration 028 explicitly gated on the review
("on the stated condition that migration 028 is applied before the merge is pushed") and one
WARNING. The reviewer verified with its own runs: battery 786/786 + tsc clean re-run; migration
028 additive-only, invoker-rights function, EXECUTE revoked from public/anon/authenticated, the
banned `FOR ALL`/`WITH CHECK (true)`/`public` shape nowhere; the CTE chain genuinely atomic (one
snapshot; the unreferenced data-modifying CTE still executes; jsonb_to_recordset column list
matches 024 column-for-column); the one-chunker swap evidence byte-identical to the 2026-08-12
lexical run; the birth-door guard honest about its text-scan limits; no test certifying an untrue
premise; `AddInvestorCall.tsx` grep-confirmed as the only POST caller (always sends companyId);
no secrets, no stowaways.

Round-1 finding, answered in d373fd7 (the only commit after the reviewed sha):

FINDING · WARNING · src/lib/live/finishLiveCall.ts:110 · `resolveFinishCompanyId` discards the
`error` on its companies select, so a transient DB read failure throws "cannot attribute … to a
TASE issuer" (an invented cause), and because that throw precedes `birthLiveStub`, a first-ever
airing failing there leaves NO row — the poller reads status 'none' instead of a visible failed
row.
RECURRENCE: yes → the awaited-supabase-result-is-LOOKED-AT law (app.md "Gating an endpoint
changes every caller's ERROR path"; supabaseWriteDiscipline's class — the fourth filing of the
discarded-`{ error }` defect, escaping through the read gap that scan stated in its own limits).

Per ADR-0002 the `yes` bought a stronger mechanism in the same commit as the fix (d373fd7):
- The fix: the read error now throws its own distinct, retryable "companies read FAILED …
  transient" message — a failed read is never an attribution verdict.
- The mechanism: `src/lib/supabaseReadDiscipline.test.ts` fails any awaited supabase destructure
  whose chain ends in `.single(`/`.maybeSingle(` and whose destructure drops `error`, over a
  per-file DROPPED ratchet (16 pre-existing sites, each with its stated fail-closed/pre-existing
  reason; both jaws — a new site fails, a fixed-but-still-ratcheted site fails too).
- The law's declaration moved in `.claude/rules/app.md` (two scans → three), with the occurrence
  histories relocated to the tests' own headers to hold the always-on token budget.

Round 2 (at d373fd7): verdict copied verbatim below.

---

Round-2 verification (reviewer's own runs at d373fd7): the fix answers the named failure
scenario (invented-cause path gone; the residual first-ever-airing edge surfaces accurately in
the log, is ratcheted with its reason, and is unreachable in the shipped environment); the scan's
two-jaw ratchet spot-checked against the code (4 of 16 reasons verified) and PROVEN TO FIRE —
reintroducing the dropped-error shape fails the test naming the exact site; the commit contains
exactly the obligation's four files; battery 787/787 + tsc clean, run by the reviewer.
The round-1 condition stands: migration 028 applied before the merge is pushed.

REVIEWED: d373fd7 (round 2 — delta from approved 81e8b0a is this one commit; fix, mechanism and declaration verified, scan proven to fire on the defect it was built for)
VERDICT: APPROVED
FINDINGS: none
