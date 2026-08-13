# Retrieval methods for a Hebrew financial corpus — research findings

Ticket: `.scratch/smart-layer/issues/01-retrieval-methods-research.md` · Written: 2026-08-12
Status: research complete, pending eval prototype (ticket 07)

**How this was researched.** Primary-source *fetches* were unavailable in this session; every claim
below was corroborated through web-search result snippets quoting the primary source, with the
owning URL cited. Claude pricing comes from the bundled Anthropic API reference (cached
2026-06-24). Claims marked **[unverified]** come from model knowledge or a third-party aggregator
and were not corroborated against the owning source — the eval prototype (ticket 07) or a
follow-up fetch must confirm them before they carry weight.

---

## 0. The corpus this must serve (from `foundations.md`)

- **Transcripts**: `formatted_data.sections[].lines[]`, every line with a stable id (`L0001`) and
  timestamp. 5 attributed rows today (55 Timlul-era rows exit via ticket 04), growing with every
  hosted call.
- **Filings**: `document_pages` (2,549 rows; `document_id, page_no, text`) — already page-anchored
  plain text.
- **MAYA company data**: structured (`maya_issuers` 233, `companies` 234, `scheduled_calls` 895) —
  *not text*, and `name_en` is NULL everywhere; no alias table (בז"א resolves to nothing).
- **Citation anchors are decided and shipped** (`workspace_doc_blocks`): `source_page` XOR
  `source_line_id`, plus `source_quote` snapshot because `formatted_data` regenerates.
- `vector` 0.8.0 available on the Supabase instance, **not installed**; no `pg_trgm`, no FTS index.

---

## 1. Chunking — what the evidence says

**The measured spread between chunking strategies is real but bounded.** Chroma's technical report
"Evaluating Chunking Strategies for Retrieval" (July 2024) ran token-level recall/precision/IoU
evals across strategies and found up to **~9% recall difference** between strategies;
`RecursiveCharacterTextSplitter` at **400–512 tokens** reached ~85–90% recall, their
`ClusterSemanticChunker` (400 tokens) 91.3%, and LLM-driven semantic chunking 91.9% — the last two
at significant preprocessing cost.
Source: https://www.trychroma.com/research/evaluating-chunking (code:
https://github.com/brandonstarxel/chunking_evaluation).

**Anthropic's guidance** (contextual-retrieval post): chunks of "no more than a few hundred
tokens"; chunk size, boundary and overlap are things to experiment with per corpus; and delivering
**top-20 chunks** to the model outperformed top-5 and top-10 in their tests.
Source: https://www.anthropic.com/engineering/contextual-retrieval

**What this means for Atlas — structure is free here, use it:**

- **Transcripts**: the natural unit is not a single line (too small — a line is a sentence
  fragment) but a **window of consecutive lines cut along section/speaker seams**, targeting
  ~200–400 tokens. This is exactly the founder's "sentence-based for transcripts" hypothesis,
  refined: sentence *boundaries* (the lines) are the atoms, but the retrieval unit is a
  multi-line window. `plan.ts` already cuts along `## section` seams — same instinct.
- **Filings**: the **page is the natural chunk** (founder's "structure-based for reports" —
  confirmed). `document_pages` rows are already the unit; a page that exceeds ~800 tokens
  [threshold to be tuned in the eval] gets split on paragraph boundaries, all sub-chunks keeping
  `page_no`.
- **Hebrew caveat**: every published chunk-size number is measured on English. Atlas's own
  calibration (2.1 chars/token Hebrew vs 3.9 Latin, `plan.ts`) means "400 tokens" is a different
  amount of *text* in Hebrew — the eval must sweep chunk size on our own corpus, not inherit
  Chroma's number.

A newer alternative worth knowing about: Voyage's **contextualized chunk embeddings**
(`voyage-context-3`, June 2026 `voyage-context-4`) embed chunks with document-level context baked
into the model, claiming to remove the need for manual context prepending.
Source: https://blog.voyageai.com/2025/07/23/voyage-context-3/ and
https://blog.voyageai.com/2026/06/29/voyage-context-4/ — Hebrew quality **[unverified]**.

---

## 2. Anthropic's Contextual Retrieval — numbers and applicability

From the engineering post (https://www.anthropic.com/engineering/contextual-retrieval),
corroborated across multiple secondary writeups:

| Technique | Top-20 retrieval failure rate | Reduction |
| --- | --- | --- |
| Baseline embeddings | 5.7% | — |
| + Contextual Embeddings | 3.7% | **35%** |
| + Contextual BM25 (hybrid) | 2.9% | **49%** |
| + Reranking | 1.9% | **67%** |

- **Preprocessing cost**: with prompt caching, the one-time cost of generating a 50–100-token
  context blurb per chunk (whole document cached, per-chunk completion billed) was **$1.02 per
  million document tokens** (assuming 800-token chunks, 8k-token docs).
- **Embedding models**: Anthropic found **Gemini and Voyage** embeddings particularly effective
  in this setup.
- **When to skip RAG entirely**: "if your knowledge base is smaller than 200,000 tokens (about
  500 pages), you can just include the entire knowledge base in the prompt" + prompt caching.

**Applicability to Atlas:** the technique targets exactly our failure mode — a chunk that says
"החברה רשמה גידול של 3% ברבעון" is useless without *which company, which quarter*. But note:

1. **Most of our context is metadata we already have.** Company name, call date, quarter, section
   title, speaker — all derivable deterministically from `transcripts` /
   `company_documents` rows at zero LLM cost. A deterministic prefix
   (`"שיחת ועידה Q1 2026 · בזן · דברי המנכ"ל · "`) captures much of what Anthropic pays an LLM
   for. The LLM-generated blurb is the *increment* to measure, not the starting point.
2. **Cost is trivial at our scale.** 2,549 pages (~1–1.5M tokens, rough; measure) + 5 transcripts
   → low single-digit dollars even with an LLM pass. Cost is not the deciding factor; Hebrew
   blurb quality is.
3. **Anchors stay pure**: the context prefix goes into the *embedded/indexed* text only. The
   stored chunk keeps verbatim text + line-id range / page_no, so `source_quote` comparison still
   works. This must be a hard rule in the schema.

---

## 3. Hybrid search (lexical + vector) and RRF

- **The case for a lexical channel** is Anthropic's own: embeddings miss exact identifiers
  (their example: a query for error code "TS-999"), and adding BM25 took the failure-rate
  reduction from 35% to 49%. Source: https://www.anthropic.com/engineering/contextual-retrieval
- **Reciprocal Rank Fusion** is the standard, implementation-independent way to merge ranked
  lists: `score = Σ 1/(k + rank)`. Cormack, Clarke & Buettcher (SIGIR 2009) showed it beating
  Condorcet fusion and individual learning-to-rank methods.
  Source: https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf
- **Supabase's own hybrid-search recipe** is exactly this: a `tsvector` column + a pgvector
  column, two CTEs, fused with RRF in one SQL function; parameters `full_text_weight`,
  `semantic_weight` (default 1/1) and `rrf_k` (default 50).
  Source: https://supabase.com/docs/guides/ai/hybrid-search

### The Hebrew problem in the lexical channel

- **Postgres has no Hebrew stemmer.** The default FTS dictionaries (snowball) don't cover
  Hebrew; the `simple` configuration "performs no stemming" — it lowercases and splits only.
  Sources: https://www.postgresql.org/docs/current/textsearch.html,
  https://blog.meilisearch.com/postgres-full-text-search-limitations/
- Hebrew morphology makes this expensive: rich inflection plus clitic prefixes
  (ו/ה/ב/ל/מ/ש/כ) mean `simple` misses `וההכנסות` when the query says `הכנסות`. The pg_hspell
  extension (hspell-based Hebrew lemmatizer for Postgres FTS) exists —
  https://github.com/IgKh/pg_hspell — but it is **not in Supabase's managed extension list
  [unverified — check `mcp__supabase__list_extensions` before assuming]**, so it is likely
  unavailable to us.
- **PGroonga IS a Supabase-supported extension** and provides language-agnostic full-text
  indexing ("fast full text search platform for all languages"); Supabase added it explicitly
  for multi-language users. Sources:
  https://supabase.com/docs/guides/database/extensions/pgroonga,
  https://pgroonga.github.io/ — Hebrew is not named in the docs (they showcase CJK), so Hebrew
  behavior is **[to be measured]**, but its n-gram indexing does not depend on stemming.
- **pg_trgm** is trigram-based and needs no stemmer, and handles substring matching. One caveat
  found: PGroonga's comparison page claims pg_trgm "disables non-ASCII characters support" by
  default (https://pgroonga.github.io/reference/pgroonga-versus-textsearch-and-pg-trgm.html);
  standard PGDG/managed builds on UTF-8 databases generally DO handle Hebrew trigrams
  **[conflicting sources — must verify on Supabase directly with a 3-line test]**.
  Base docs: https://www.postgresql.org/docs/current/pgtrgm.html
- **The cheap trick we already own**: `plan.ts` already strips leading ו/ה/ב/ל/מ/ש/כ for
  term-overlap scoring. The same normalization applied at *index build time* (index both surface
  form and prefix-stripped form into a `simple` tsvector) buys a poor-man's Hebrew lexer with no
  new extension. Not a stemmer — inflected suffixes still miss — but it directly targets the
  most common miss class.
- **BGE-M3's sparse output** is a fourth option: the model emits dense + sparse (learned lexical
  weights) + multi-vector simultaneously, over 100+ languages and 8,192-token inputs — a lexical
  signal that never touches Postgres FTS. Sources: https://arxiv.org/abs/2402.03216,
  https://huggingface.co/BAAI/bge-m3. Cost: self-hosting complexity; sparse vectors need their
  own storage/query path.

**Verdict:** hybrid is worth it here *specifically because* of exact-term needs (§6) — but the
lexical channel's Hebrew recall is the single most uncertain component in this whole design, and
must be measured, not assumed.

---

## 4. Hebrew embedding quality — the honest picture

**There is no trustworthy public Hebrew retrieval leaderboard.** MMTEB (the massive multilingual
MTEB expansion, ICLR 2025) covers 250+ languages and 500+ tasks, and Hebrew is among the covered
languages, but Hebrew-specific *retrieval* tasks are thin and no per-language Hebrew leaderboard
stands out. Sources: https://arxiv.org/abs/2502.13595, https://huggingface.co/mteb. The Hebrew
NLP ecosystem (DictaBERT/AlephBERTGimmel, HeRo, DictaLM, the Hebrew LLM leaderboard) is
LLM/encoder-focused, not retrieval-embedding-focused. Sources:
https://arxiv.org/pdf/2407.07080, https://huggingface.co/blog/leaderboard-hebrew,
https://github.com/NNLP-IL/Hebrew-Resources. **This is why D8's "measured, not assumed" clause
(`docs/superpowers/specs/2026-08-04-workspace-experience-design.md`) is the controlling law
here — our own ten-question eval is the benchmark.**

Candidates (pricing from aggregators/provider blogs via search — treat exact prices as
**[unverified]** until read off the provider's live pricing page):

| Model | Dims | Price /1M tok | Notes |
| --- | --- | --- | --- |
| **gemini-embedding-001** (Google) | 3072, MRL → 1536/768 | ~$0.15 | #1 on MTEB Multilingual at launch (mean 68.32); 100+ languages; Anthropic found Gemini embeddings effective for contextual retrieval. https://arxiv.org/pdf/2503.07891 · https://ai.google.dev/gemini-api/docs/embeddings **[pricing unverified]** |
| **text-embedding-3-large** (OpenAI) | 3072, MRL via `dimensions` | ~$0.13 | Repo already has OpenAI key/plumbing. https://platform.openai.com/docs/guides/embeddings **[pricing unverified]** |
| **embed-v4.0** (Cohere) | 256/512/1024/1536 | ~$0.12 | 100+ languages, strong non-Latin-script claims; multimodal. https://docs.cohere.com/docs/cohere-embed **[Hebrew-specific evidence: none found]** |
| **voyage-3.5 / voyage-3-large** | 2048/1024/512/256 | ~$0.06 | Cheapest API option; multilingual eval covers 26 languages and **Hebrew is not listed among them**. https://blog.voyageai.com/2025/05/20/voyage-3-5/ · https://docs.voyageai.com/docs/embeddings **[Hebrew support unverified]** |
| **BGE-M3** (open, BAAI) | 1024 dense (+sparse +colbert) | self-host | 100+ langs, 8192-token input, dense+sparse in one pass. https://arxiv.org/abs/2402.03216 |
| **multilingual-e5-large** (open, intfloat) | 1024 | self-host | Hebrew (`he`) explicitly in its 100 languages; **512-token input cap** — fine for our chunk sizes; a Hebrew-QA fine-tune of me5 exists on HF. https://huggingface.co/intfloat/multilingual-e5-large |

**Dimension × pgvector constraint (decisive):** pgvector's HNSW index caps the `vector` type at
**2,000 dims**; `halfvec` (fp16) extends indexing to **4,000 dims**. Sources:
https://github.com/pgvector/pgvector (README/issue #461),
https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes. So a 3072-dim embedding either
(a) uses `halfvec` or (b) is truncated via MRL to **1536**, which both Gemini and OpenAI support
natively with "modest quality loss" per their docs. **Recommendation: standardize on 1536-dim
MRL** — indexable as plain `vector`, halves storage, and keeps the model swappable (both leading
candidates emit 1536 natively). Verify the Hebrew-specific loss of 3072→1536 in the eval.

**Shortlist for the eval:** `gemini-embedding-001` (repo already speaks Gemini; top multilingual
benchmark) vs `text-embedding-3-large` (repo already speaks OpenAI) as the two API candidates,
with `multilingual-e5-large` or `BGE-M3` as the open-source control. Voyage only if its Hebrew
support is confirmed in writing.

---

## 5. Long context instead of RAG — the arithmetic

**Guidance:**
- Anthropic: below ~200K tokens, stuff the whole knowledge base + prompt caching; RAG is for
  corpora that don't fit. https://www.anthropic.com/engineering/contextual-retrieval
- "Retrieval Augmented Generation or Long-Context LLMs?" (Google DeepMind/UMich, EMNLP 2024):
  when affordable, long-context **consistently outperforms** RAG on average; RAG's advantage is
  cost; their SELF-ROUTE hybrid (model decides per query) cut cost 65% (Gemini-1.5-Pro) / 39%
  (GPT-4o) at near-LC quality; LC and RAG give identical answers on >60% of queries.
  https://arxiv.org/abs/2407.16833
- Databricks Mosaic ("Long Context RAG Performance of LLMs", 2,000+ experiments, 13 models):
  more retrieved context helps *up to a model-specific threshold* (~32–64K for many models),
  then quality degrades with distinct failure modes; only the strongest models hold accuracy
  above 64K. https://arxiv.org/abs/2411.03538

**Atlas's numbers today:**
- 5 attributed transcripts. At the repo's calibrated 2.1 chars/token, a full transcript
  (~40–80k chars) is roughly **19–38k tokens**; five of them ≈ **100–190K tokens** [measure —
  this straddles the 200K line already].
- Per-query cost of stuffing all five into a prompt (input side only):

| Model | $/1M input | 150K-token prompt, uncached | cached read (~0.1×) |
| --- | --- | --- | --- |
| Gemini 3.5 Flash (repo's current chat model) | ~$1.50 **[unverified, aggregator]** | ~$0.23 | ~$0.02 + cache storage/hr |
| Claude Haiku 4.5 | $1.00 | $0.15 | ~$0.015 |
| Claude Sonnet 5 | $3.00 ($2 intro) | $0.45 | ~$0.045 |
| Claude Opus 5 | $5.00 | $0.75 | ~$0.075 |

  (Claude prices from the bundled Anthropic reference, cached 2026-06-24; cache reads ~0.1×
  input, cache writes 1.25× (5-min TTL) / 2× (1-h TTL). Gemini context caching similarly ~0.1×
  reads + per-hour storage per Google's pricing docs **[verify on
  https://ai.google.dev/gemini-api/docs/pricing]**.)

**Conclusions:**
1. **For transcripts *today*, whole-corpus stuffing is affordable and is the honest quality
   baseline.** The eval prototype MUST include it — if retrieval can't beat "shove all five
   transcripts in", retrieval isn't ready. This is also literally what D8 specified.
2. **It stops scaling almost immediately.** Every hosted call adds ~20–40K tokens; at ~10–20
   transcripts the corpus blows past both the 200K guidance and the Databricks degradation
   thresholds. And `document_pages` alone (~1M+ tokens) is *already* out of reach.
3. **Scoped stuffing survives longer than corpus stuffing**: "one company's last 4 calls" stays
   under 200K for a long time. A router (à la SELF-ROUTE) that stuffs when the resolved scope is
   small and retrieves when it isn't is the natural end state.

---

## 6. Exact-term retrieval (tickers, dates, figures)

Three distinct needs, three different mechanisms — don't force them all through one index:

1. **Tickers / company names / aliases** (בז"א, בזן, ORL): this is an **entity-resolution
   problem, not a retrieval problem**. The proved failure (`resolveIssuer('בז"א')` → null while
   the full name → 1361) lives in the resolver. Fix = alias table + resolver (tickets 04/06
   territory); retrieval then *filters by* `company_id` instead of hoping an embedding lands.
   Structured filter > any text search for identifiers we can resolve.
2. **Figures and dates in running text** ("3.2 מיליארד", "Q1", "31.12.2025"): numerals are
   script-neutral, so even the `simple` tsvector config matches them — this is where the lexical
   channel of hybrid search earns its place (Anthropic's TS-999 case). Embeddings are famously
   weak here.
3. **Fielded dates** (call date, period): metadata columns + SQL predicates, never text search.
   Note the known trap: `company_documents` has **no publication-date column** (`created_at` is
   ingestion time) — exact-date answers about filings need that column added before any design
   can serve them.

Per-design: Design A (stuffing) serves exact terms perfectly within scope (the model sees
everything). Design B (vector-only) serves them **worst** — this is its predicted failure slice.
Design C (hybrid) serves 2 via lexical and 1+3 via filters.

---

## 7. Citation anchoring — which designs preserve it

The anchor quartet (`source_label`, `source_page` XOR `source_line_id`, `source_quote`) is
already law. Consequences for chunking:

- **Line-window chunks** (transcripts): store `first_line_id`, `last_line_id`, and the verbatim
  text. Any retrieved chunk cites trivially; the model is asked to name the specific line inside
  the window it used. **Preserved trivially.**
- **Page chunks** (filings): carry `page_no` by construction. **Preserved trivially.**
- **Contextual prefixes** (deterministic or LLM): embedded/indexed text ≠ stored citable text.
  Schema must keep `content` (verbatim, citable) separate from `embedding_input`
  (prefix + content). A design that embeds only the concatenation and stores it as one field
  breaks `source_quote` comparison — **forbidden shape**.
- **Semantic/LLM chunking that rewrites or merges text**: breaks verbatim anchoring by
  construction. **Excluded** for Atlas regardless of its +1–2% recall on Chroma's eval — our
  drift-detection design depends on verbatim snapshots.
- Chunks are derived data over regenerable `formatted_data` — chunk rows must be **rebuildable
  and versioned per transcript regeneration** (re-chunk on reprocess), or anchors silently rot
  the same way `L0004` does.

---

## 8. Recommendations per corpus type

**Transcripts** (founder hypothesis: sentence-based + hybrid → **confirmed, refined**):
line-windows of ~200–400 tokens cut on section/speaker seams, carrying line-id ranges;
deterministic metadata prefix (company · date/quarter · section · speaker) in the embedding
input; dense embeddings + lexical channel fused with RRF (Supabase recipe); filter by
`company_id` when the query resolves to one.

**Filings / `document_pages`** (founder hypothesis: structure-based → **confirmed**): page as
chunk (split oversized pages on paragraphs, keep `page_no`); deterministic prefix (company ·
document title · page); this corpus is where LLM contextual blurbs are most likely to add value
(a filing page is more context-starved than a transcript line) — measure as an increment.

**MAYA company data**: **do not embed rows.** It is structured data — serve it through the
resolver + SQL (and later, tool calls). The one embedding-worthy surface is the free-text company
`description`/sector blurb for fuzzy "find me companies like…" queries — optional, later. The
prerequisite investment is the **alias table** (Hebrew abbreviations, `name_en` backfill), which
multiplies the value of every other design by making `company_id` filters reachable from user
language.

---

## 9. Candidate designs for the eval prototype (ticket 07)

All three share: the eval set of ~10 Hebrew questions with known answers over the 5 attributed
transcripts + a filings slice (per D8), including at least 2 exact-term questions (ticker,
figure) and 2 cross-document questions. Score: correct answer + correct citation (line id/page).

**Design A — scoped long context (the baseline that must be beaten).**
No new infra. Resolve scope (company/call) → stuff the full transcript(s)/pages into the prompt
with caching → answer with line-id citations. Predicted: best quality at today's scale, cost
~$0.02–0.5/query depending on model and caching, dies on corpus growth and cross-corpus
questions. Measures: the quality ceiling and the true cost curve.

**Design B — pgvector-only semantic retrieval.**
Migration installs `vector`; one shared-corpus `document_embeddings` table (no `user_id` — per
`docs/DATA-MODEL.md`), columns ≈ `(id, source_type, transcript_id/document_id, company_id,
first_line_id, last_line_id, page_no, content, embedding_input, embedding vector(1536))`, HNSW
index, top-20 by cosine, `company_id` filter when resolved. Embeddings: gemini-embedding-001 @
1536 MRL (swap-in text-embedding-3-large as the A/B). Deterministic prefixes only (no LLM pass).
Predicted: good on paraphrase questions, fails the exact-term slice. Measures: Hebrew embedding
quality head-to-head, MRL truncation loss, and how far semantic-only gets.

**Design C — hybrid (B + lexical + RRF), the Supabase recipe.**
Adds a `tsvector` ('simple' config, indexing surface + prefix-stripped forms) or PGroonga index
on the same chunk table; two CTEs fused with RRF (`rrf_k=50`, weights 1/1 to start). Optional
increments to measure separately: **C+ctx** (LLM contextual blurbs at Anthropic's ~$1/M tokens)
and **C+rerank** (a multilingual reranker over top-50 → top-20; Cohere Rerank claims multilingual
support **[Hebrew quality unverified]**). Predicted: closes the exact-term gap; the open risk is
Hebrew lexical recall (§3). Measures: hybrid's real gain over B on our corpus, per query-class.

Decision rule after the eval: if C ≥ B ≥ A on quality at acceptable cost, ship C's shape. If A
still wins on quality, ship A behind a scope-size router and revisit retrieval when the corpus
outgrows it — SELF-ROUTE says both worlds can coexist cheaply.

---

## 10. What must be measured on OUR corpus before trusting any of this

1. **Hebrew embedding quality head-to-head** (gemini-embedding-001, text-embedding-3-large,
   multilingual-e5-large/BGE-M3) on our transcripts — no public Hebrew retrieval benchmark
   substitutes for this (§4). D8 already demands it.
2. **The long-context baseline** (Design A) vs retrieval, same questions — and the *actual*
   token counts of the 5 transcripts and of `document_pages` (my 100–190K / ~1M+ figures are
   estimates).
3. **Hebrew lexical recall**: `simple` tsvector with vs without prefix-stripped dual indexing;
   pg_trgm behavior with Hebrew on Supabase specifically (conflicting sources, §3); PGroonga on
   Hebrew if enabled. One afternoon, one test table.
4. **MRL truncation loss on Hebrew** (3072 → 1536 → 768) — provider claims are
   English-benchmark claims.
5. **Chunk-size sweep in Hebrew tokens** (Chroma's 400-token sweet spot is English-measured);
   window overlap yes/no.
6. **Deterministic prefix vs LLM contextual blurb**: how much of Anthropic's 35–49% is already
   captured by metadata we get for free — their numbers come from English corpora (codebases,
   papers), not conversational Hebrew.
7. **Exact-term slice** (tickers, figures, dates) scored separately per design — the aggregate
   score will hide exactly the failures the founder notices.
8. **Citation integrity end-to-end**: every retrieved chunk's line-id range resolves against
   current `formatted_data`; re-chunk-on-regeneration keeps anchors valid; `source_quote` drift
   detection still fires.
9. **Operational**: pgvector HNSW build memory on our Supabase instance size; embedding-API
   latency inside the 18K-token-budget flow; per-query cost logged, not estimated (cost-per-answer
   is a design constraint per the 2026-08-09 brief).
10. **Verify the [unverified] list**: provider pricing pages (Gemini embedding + caching, OpenAI,
    Cohere, Voyage), Voyage/Cohere Hebrew support statements, Supabase extension availability
    (`pg_trgm`, `pgroonga`, absence of `pg_hspell`), and Cohere Rerank multilingual claims.

---

## Sources

- Anthropic, "Introducing Contextual Retrieval" — https://www.anthropic.com/engineering/contextual-retrieval
- Chroma, "Evaluating Chunking Strategies for Retrieval" — https://www.trychroma.com/research/evaluating-chunking · https://github.com/brandonstarxel/chunking_evaluation
- Cormack, Clarke, Buettcher, "Reciprocal Rank Fusion outperforms Condorcet…" (SIGIR 2009) — https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf
- Supabase docs: Hybrid search — https://supabase.com/docs/guides/ai/hybrid-search · HNSW indexes — https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes · PGroonga — https://supabase.com/docs/guides/database/extensions/pgroonga
- pgvector — https://github.com/pgvector/pgvector (dims limits; halfvec) · https://github.com/pgvector/pgvector/issues/461
- PostgreSQL docs: Full Text Search — https://www.postgresql.org/docs/current/textsearch.html · pg_trgm — https://www.postgresql.org/docs/current/pgtrgm.html
- pg_hspell (Hebrew FTS dictionary) — https://github.com/IgKh/pg_hspell
- PGroonga vs textsearch/pg_trgm — https://pgroonga.github.io/reference/pgroonga-versus-textsearch-and-pg-trgm.html
- MMTEB — https://arxiv.org/abs/2502.13595 · https://huggingface.co/mteb
- Gemini Embedding paper — https://arxiv.org/pdf/2503.07891 · Gemini API embeddings docs — https://ai.google.dev/gemini-api/docs/embeddings
- OpenAI embeddings — https://platform.openai.com/docs/guides/embeddings
- Cohere Embed — https://docs.cohere.com/docs/cohere-embed
- Voyage AI — https://blog.voyageai.com/2025/05/20/voyage-3-5/ · https://blog.voyageai.com/2025/07/23/voyage-context-3/ · https://docs.voyageai.com/docs/embeddings
- BGE-M3 — https://arxiv.org/abs/2402.03216 · https://huggingface.co/BAAI/bge-m3
- multilingual-e5-large — https://huggingface.co/intfloat/multilingual-e5-large
- Li et al., "RAG or Long-Context LLMs? … Hybrid Approach" (SELF-ROUTE, EMNLP 2024) — https://arxiv.org/abs/2407.16833
- Databricks Mosaic, "Long Context RAG Performance of LLMs" — https://arxiv.org/abs/2411.03538
- Hebrew NLP resources — https://github.com/NNLP-IL/Hebrew-Resources · https://huggingface.co/blog/leaderboard-hebrew · DictaLM 2.0 — https://arxiv.org/pdf/2407.07080
- Claude pricing/caching: bundled Anthropic API reference (skill cache 2026-06-24); live: https://platform.claude.com/docs/en/pricing
