# Review — feat/smart-layer-a2-company-resolver

Cold review by the atlas-reviewer subagent, three rounds.

Round 1 (at 3290667's parent, ce22bae + docs): APPROVED with one WARNING (the seed script's
collision guard only saw the current run's derivation, so a re-run diverging from an
already-seeded row was silently swallowed by UNIQUE(alias) — the drift the script's header
calls a founder decision was never reported) and one NIT (resolve.ts duplicated
MIN_FRAGMENT from issuers.ts, redundant with the coverage pass's own floor). Both fixed in
3290667: `diffAliasSeedAgainstExisting()` judges drift on the normalized form and reports
it, never inserts it; the duplicated floor removed, behavior-preserving.

Round 2 (at 3290667): APPROVED with one NIT — ARCHITECTURE.md's test-count header
hand-carried stale (732 while the branch measured 736), answered `RECURRENCE: yes → Counts
carry their command (M1's hand-carried-count clause)`. Per ADR-0002 that bought a stronger
mechanism in the same commit as the fix (9eb09ab): the ship gate's count re-measure now
reaches ARCHITECTURE.md's "**N tests across M files**" header — file count judged against
package.json for free, test total against the battery run the gate makes. Its maiden firing
caught both the stale header (732 vs 741) and the PROGRESS entry's own intermediate 736.
M1 is a meta-law outside the `**LAW ·` set the gate's promotion ritual resolves against
(the deferred meta-law-visibility decision, DECISIONS.md 2026-08-12) — verified by the
reviewer against parseLaws (26 laws, zero matches) — so this record follows the
feat-ship-gate-verified-counts precedent: prior findings closed in prose, final verdict
FINDINGS: none. Final verdict, copied verbatim below.

---

REVIEWED: 9eb09ab1e4c2bbe136e7c70e2d626abcc5aa06d8 (feat/smart-layer-a2-company-resolver)
VERDICT: APPROVED
FINDINGS: none

All prior findings are fixed and verified at the tip by the reviewer's own runs:

- Round-1 WARNING (seed-script cross-run blindness): diffAliasSeedAgainstExisting() judges drift on the NORMALIZED form, reports it for the founder, and never inserts it; the insert loop writes only toInsert, with the residual UNIQUE(alias) race reported rather than swallowed. Unit tests cover same-company skip, different-company drift, the raw-distinct-spelling attack, and the empty-table path.
- Round-1 NIT (duplicated MIN_FRAGMENT): removed; the coverage pass rests on wordsOf's single floor in issuers.ts, behavior-preserving, one-letter-query test still green.
- Round-2 NIT (ARCHITECTURE.md:332 hand-carried stale at 732): regenerated to 741/76 from the gate's own measurement, and the RECURRENCE: yes bought its mechanism in the same commit per ADR-0002 — architectureCountClaim()/architectureCountProblems() in scripts/lib/ship-gate.mjs (5 unit tests), wired into npm run ship:gate: file count vs package.json checked free, test total vs the battery run the gate makes, a claim-bearing ARCHITECTURE.md touch forcing a run. The reviewer's direct probes confirmed a stale 732 and a wrong file count are both refused; the stated limit (an untouched header with no run stays unjudged until the next claim-bearing branch) is documented in the code and in the header line itself. The meta-law "Counts carry their command" is not in the LAW-block set the gate's promotion ritual resolves against (deferred meta-law-visibility decision, DECISIONS.md 2026-08-12) — verified by the reviewer against parseLaws: 26 laws, zero matches — so this record follows the feat-ship-gate-verified-counts precedent: prior findings closed in prose, final verdict FINDINGS: none.

Evidence at 9eb09ab (working tree clean, primary checkout):
- npm test → 741/741 green; npx tsc --noEmit exit 0.
- npm run ship:gate → ran the battery for the claims, zero count problems at 741/76, owes only this review record — which this verdict becomes.
- The commit contains exactly the mechanism, its tests, the wiring, and the two regenerated counts. No stowaways, no secrets, no DDL, no Wave-2 gateway imports.
