# Retrieval eval — measured, not assumed

Type: prototype
Status: measured — awaiting founder reaction (2026-08-12)
Blocked by: 01, 05 (both resolved)

## Question

Measure the candidate retrieval designs from ticket 01 against the eval set from ticket 05,
on our own corpus — Hebrew embedding quality measured, not assumed (the 2026-08-04 spec's
explicit warning). Output: scores per candidate design, per-query cost and preprocessing
cost alongside quality, and a recommendation the founder can react to. This harness is kept,
not thrown away — it becomes the standing quality gate for every future retrieval change.

## Comments

**2026-08-12 — measured, recommendation filed, awaiting the founder's reaction (HITL).**
The harness is built and run on the real corpus (3,202 chunks, live from Supabase; no
pgvector installed — in-process ranking). Findings + recommendation:
[`research/07-retrieval-eval-results.md`](../research/07-retrieval-eval-results.md); raw
numbers in `scripts/retrieval-eval/results/`; harness kept at `scripts/retrieval-eval/`
(branch `feat/retrieval-eval-harness`). Headlines, in plain language:

- **The winner is the founder's own hypothesis, measured:** hybrid search + metadata
  prefix + company filtering, on Google's embeddings — it puts the right source in the
  top-20 for 10 of 15 rankable cases, and most remaining "misses" actually retrieve a
  different document containing the same answer.
- **OpenAI's embedding model is ruled out for Hebrew** — it found the right source in only
  2 of 15 cases on identical chunks (and Hebrew costs it ~2–4× more tokens). This is why
  we measured instead of trusting English benchmarks.
- **The alias table is the first build item** — filtering by resolved company was the
  single biggest quality multiplier, and it makes "בז\"א" reach the right company by
  construction (MUST-PASS case 14) and "טבע" honestly return nothing (case 17).
- **One corpus fix needed:** the duplicate Q1 transcript (`PyuMxe88e8g_live`) pollutes
  every design's results — its deletion decision joins ticket 13.
- Total measurement cost: ~$1.40 in embedding API calls, cached — reruns are free.

**What Sagi is asked to do:** read the Recommendation section of the results doc and react —
approve the recommended shape (or push back), so this ticket can close and the architecture
ticket (08) can take the decision as settled input.
