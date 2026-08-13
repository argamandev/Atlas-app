# Retrieval eval — measured, not assumed

Type: prototype
Status: resolved (2026-08-12)
Blocked by: 01, 05 (both resolved)

## Question

Measure the candidate retrieval designs from ticket 01 against the eval set from ticket 05,
on our own corpus — Hebrew embedding quality measured, not assumed (the 2026-08-04 spec's
explicit warning). Output: scores per candidate design, per-query cost and preprocessing
cost alongside quality, and a recommendation the founder can react to. This harness is kept,
not thrown away — it becomes the standing quality gate for every future retrieval change.

## Answer

**Approved by the founder 2026-08-12 ("approve, go ahead and resolve the ticket"), with
three amendments of his** — all filed verbatim in `DECISIONS.md` and folded into
[`research/07-retrieval-eval-results.md`](../research/07-retrieval-eval-results.md), which
is the full record (measured tables, findings, costs, and the amended recommendation).

The decided shape, in one paragraph: **hybrid retrieval (dense + lexical, RRF) with a
deterministic metadata prefix, on `gemini-embedding-001` @1536, filtered by resolved
`company_id`, routed by scope size** (small resolved scope → stuff whole documents; large or
cross-corpus → top-20 retrieval). OpenAI's `text-embedding-3-large` is **ruled out for
Hebrew by measurement** (2/15 vs Gemini's 7/15 on identical chunks, plus a 2–4× Hebrew token
tax). The founder's amendments: (1) **structured-facts layer** — the known repeated numerics
of TASE filings become an extracted lookup, not a search (feasibility via ticket 14);
(2) **@company mentions** as the explicit scoping UX over the alias table; (3) **Chat gets a
visible search mode** for market-wide discovery with leads-style, per-company-diversified
answers (never a hidden classifier guess). Prerequisites confirmed by measurement: the alias
table is the first build item; the `PyuMxe88e8g_live` duplicate must die (ticket 13); the W1
attribution guard lives at the answer layer; case 13 gates ticket 08. The harness at
`scripts/retrieval-eval/` is the standing quality gate — every future retrieval change is
judged by it.

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
