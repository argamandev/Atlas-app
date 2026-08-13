# A4 acceptance gate — the harness against the REAL pipeline

Ticket 04's acceptance, verbatim: *"the standing 18-case harness (`scripts/retrieval-eval/`)
re-runs against the REAL pipeline (pgvector + real tsvector lexical channel) and reproduces the
measured eval results, MUST-PASS cases included."*

The gate ran. **It did not pass, and finding out why is what it was for.**

> **OUTCOME, 2026-08-14: the founder chose dense-only** — *"okay yes lets just go with the
> semantic search now, and after we finish working on the rest of the tickets and test the
> product we can come back to it and improving it."* (`DECISIONS.md`). Dense is the one design
> below that DID reproduce, so what ships is measured. This file is the standing evidence for the
> revisit he asked for; read the root-cause section before proposing any lexical work.

- Measured (in-process, 2026-08-12): `scripts/retrieval-eval/results/run-2026-08-12T23-29-52.md`
- Real pipeline (2026-08-14): `scripts/retrieval-eval/results/run-real-2026-08-13T14-09-12.md`
- Command: `node --import tsx scripts/retrieval-eval/run.mjs --real`

---

## Verdict in one table

| Design | measured MRR | real MRR | hit@5 | hit@20 | reproduces? |
| --- | --- | --- | --- | --- | --- |
| dense, unscoped (`B-gemini`) | 0.254 | **0.254** | 6/15 → 6/15 | 7/15 → 7/15 | **exactly** |
| dense, scoped (`B-gemini-scoped`) | 0.268 | **0.268** | 7/15 → 7/15 | 8/15 → 8/15 | **exactly** |
| lexical (`L`) | 0.207 | 0.075 | 4/15 → 1/15 | 8/15 → 2/15 | **no — collapses** |
| hybrid (`C-gemini`) | 0.300 | 0.131 | 5/15 → 2/15 | 9/15 → 7/15 | **no** |
| hybrid, scoped (`C-gemini-scoped`) — *the chosen design* | 0.365 | 0.141 | 7/15 → 2/15 | 10/15 → 8/15 | **no** |

The dense channel reproduces to three decimal places — **hit-set for hit-set**, with identical
missed-sets. Two honest qualifications on that sentence, because the decision below rests on it:

**1. "Case for case" would overstate it.** MRR and both hit-sets reproduce exactly, but three deep
ranks moved with the 21 removed chunks (case 04: 220→214, case 10: 99→95, case 11: 136→133). No
case crossed a threshold.

**2. THE ANN INDEX WAS NEVER EXERCISED.** The unscoped dense channel returned all 3,181 rows while
`hnsw.ef_search` was clamped to 1,000 — which an HNSW index scan cannot do. The planner answered
exactly, by sequential scan, because at 3,181 rows that is cheaper. So what reproduced is **exact
cosine**, and every number here is a statement about *this corpus size*, not about the pipeline
A5 will run: at ~60K pages the planner will use the index, and HNSW is approximate by
construction. The dense channel's reproduction should be re-measured once the corpus is large
enough to make the index engage. That is a real inherited risk for B1, not a caveat for its own
sake.

The lexical channel does not reproduce. Because the hybrid designs are RRF fusions that include
it, **the chosen design is now worse than dense-only in production** — 0.141 against 0.268 — the
reverse of the measurement it was chosen on.

MUST-PASS: **case 14 (`בז"א`) ranks 1 in every real design.** The resolver reached the alias table
and returned `בית זיקוק אשדוד` (see the scope-resolution list in the run). Case 13 is offline and
was green in A2. The MUST-PASS gates hold.

---

## Root cause: Postgres's text rankers have no IDF

`ts_rank` and `ts_rank_cd` score by term frequency, position and cover density. Neither looks at
how many other documents contain the term. BM25's power on this corpus is almost entirely its
**inverse document frequency** — and the corpus is extreme about it. Measured document frequency
for the terms of case 01 (`מה היו ההכנסות של קבוצת תיגבור בשנת 2025`):

| term | df | share of corpus | BM25 idf |
| --- | --- | --- | --- |
| `שנת` | 3,057 | 96% | 0.04 |
| `של` | 2,648 | 83% | 0.19 |
| `2025` | 1,601 | 50% | 0.70 |
| `קבוצת` | 1,355 | 43% | 0.86 |
| `תיגבור` | 1,066 | 34% | 1.09 |
| `ההכנסות` | 158 | 5% | 3.00 |

BM25 weights `ההכנסות` **75× more than** `שנת`. `ts_rank_cd` weights them the same, so the ranking
is driven by the least informative words in the question. That is the entire gap.

**Verified, not theorised.** BM25 computed in SQL over the same `tsvector` — same k1=1.2, b=0.75,
same idf formula as the harness — puts case 16's anchor at **rank 1**, matching the measured `L`
rank of 1 exactly. So the tokenizer, the chunks and the index are all right; only the scorer is
wrong.

**A document-frequency threshold is NOT a substitute** (tested and rejected). Dropping terms above
25% df discards `תיגבור` — the company name, the most useful term in the question — because one
issuer happens to own a third of the corpus. IDF keeps it at 27× the weight of `שנת`. A threshold
cannot express that; only real term statistics can.

**Why the ad-hoc SQL is not the answer either:** computed per query with no precomputed statistics,
it runs in **31 seconds** on 3,181 chunks (`EXPLAIN ANALYZE`: the df sub-plans re-execute 11,274
times, and every matching chunk's `tsvector` is unnested). Making it fast needs a precomputed
inverted index — a real addition to the shared corpus, which is a founder call, not a side effect
of this slice.

## What this means for the build order

Slice A4 is the gate for every surface slice. B1 (the chat backend) is the first thing behind it,
and it must not ship on a retrieval channel that measurably underperforms the design it claims to
be. The options, with what each costs, are in `.scratch/smart-layer-build/issues/04-…md` under
"The open decision"; the standard already anticipated this exact gate
(`docs/INGESTION-STANDARD.md` §5: the lexical channel *"gated by one harness re-run against real
Postgres before the Chat rewrite ships, because the eval's BM25 was an in-process simulation"*).

## Two changes that are NOT regressions, and why

**Case 18's duplicate rank is now `—` in every design.** `PyuMxe88e8g_live` is out of the corpus:
it is the second row of one real Tigbur call, and the standard bans a minted sibling id. Case 18
exists to check that *"the `PyuMxe88e8g_live` duplicate does not produce a second, conflicting
citation or double-weighted retrieval."* A duplicate that cannot be retrieved at all is that case's
best possible outcome — eval finding 6 said no ranker fixes a duplicate, and this one died at the
identity door instead.

**The corpus is 3,181 chunks, not 3,202.** The 21-chunk difference is exactly the demo transcript
(`live-finish-demo-tamis-2026-06-14`) and that duplicate, both now `index_status = 'excluded'`.
92 transcript windows + 3,089 filing page chunks; the harness measured 113 + 3,089.

**Discovery case 20 reads 6 ✗ everywhere, including for designs that passed at 4–5.** The corpus
now holds seven companies with chunks, not eight — `תמיס` left with the demo row. The pass gate is
"all lead companies appear within the first 5 distinct companies", so losing a company changes the
denominator of that count for every design at once. This one is a corpus change, not a retrieval
change, and the eval set's threshold should be re-approved against the real corpus rather than
read as a regression.

## Provenance

- Corpus counted from `document_chunks` at run time, never restated: 3,181 chunks, **0 missing an
  embedding**.
- Channel truncation: **none**. Every channel returned fewer rows than its 5,000-row candidate
  pool, so every rank above was measured over the whole corpus the design was allowed to search.
  (An earlier run reported truncation everywhere — that was a bug in the reporting rule, which
  compared against pgvector's `ef_search` ceiling. `ef_search` bounds the scan's effort, not the
  answer: the unscoped dense channel returns all 3,181 rows.)
  **Stated limit of the corrected rule**, so nobody reads more into it than it says: it reports
  `truncated` when a channel returned as many rows as the pool allowed. It cannot see a channel cut
  short by `hnsw.ef_search` (≤1,000) or by a scoped iterative scan hitting `hnsw.max_scan_tuples`
  (default 20,000) while still under the requested pool. Both are unreachable at 3,181 chunks and
  reachable at A5's scale — owed there, and noted in ticket 05. The exact fix is one more
  index-backed count (rows in scope with an embedding); completeness then reads
  `saw = least(pool, in_scope)` with no ceiling comparison at all.
- Scoped designs use a **true company pre-filter** — the in-process scoped numbers were a
  documented post-filter approximation. Verified: a `תיגבור`-scoped dense channel returns 1,066
  rows, which is exactly that company's entire chunk count.
- Ranks are measured to depth 300; deeper anchors report `—`. hit@5, hit@20 and MUST-PASS are
  unaffected. Fusion itself saw the whole corpus.
