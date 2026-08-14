# B1b · Chat surface — @mentions + search mode

Status: **ACTIVE — this is the next mission** (founder call 2026-08-14, final: strict map order
07 → 08 → 09 → 10 → 11 → 12 → 13 → 14). Fully unblocked.
Blocked by: 06 (landed 2026-08-14)

**This slice now carries ticket 11's de-risking, and that is its real job.** It is the first and
cheapest place the shared tool registry (§2.2, "one tool registry, two drivers") serves a real user
in production. Three things it is expected to answer, all of which ticket 11 otherwise inherits
blind: does the tool loop behave against the real 98K-chunk corpus, what does an answer actually
cost against the $0.06 budget, and does Railway's `ANTHROPIC_API_KEY` work. Measure all three and
file the numbers — they are not a side effect of this ticket, they are part of its output.

**Read before starting — the two 2026-08-14 corrections.**

1. **The corpus gate is CLOSED.** The "only 618 of 1,296 documents embedded" warning this ticket
   carried is stale: A5 finished at 1,298 of 1,300 indexed. A red eval now means the surface, not an
   absent corpus.
2. **The acceptance line does not read cleanly against today's retrieval, and that is measured, not
   suspected** (`docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`). Split it before you score
   it:
   - **MUST-PASS cases 13 + 14 are achievable end-to-end.** Case 14 fails *unscoped*, but production
     never takes that path for a named company — `resolve_company` resolves `בז"א` off the alias
     table and `search_corpus` is then scoped, where it still ranks 1. The eval set's own 2026-08-12
     amendment says the same: the MUST-PASS closes via the resolver + alias table, and the old
     unscoped rank-1 was "corpus luck, not a mechanism."
   - **Class-G discovery is the exposed half.** Those cases are market-wide by definition, so there
     is no scope to fall back on, and unscoped dense MRR roughly halved (0.254 → 0.131). The
     **visible search mode** this ticket builds sits directly on that channel. Do not silently
     re-score the gate to make it green (app.md M2) — either the index gets fixed first, or the red
     is filed with the number beside it.

Spec §2.3 + §6 B1b. `ChatView` onto the new backend; `@company` autocomplete from the
alias table; visible search mode with per-company-diversified leads answers; degradation
UI in both locales. Acceptance: both MUST-PASS eval cases green end-to-end; class-G
discovery cases green; `/verify-app` both locales, every state; bidi law. Cost:
≤ $0.06/answer.
