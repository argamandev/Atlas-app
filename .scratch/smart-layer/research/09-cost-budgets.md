# Cost budgets — numbers, not vibes

Ticket: `.scratch/smart-layer/issues/09-cost-budgets.md` · Researched: 2026-08-12
Prices the ticket-08 architecture (Sonnet 5 default everywhere; interactive surfaces on the
Messages API from our Next.js server; agents on Managed Agents; retrieval per ticket 07;
web_search on all four surfaces). Corpus and per-query token counts are the MEASURED numbers
from `research/07-retrieval-eval-results.md`; the agent-run shape is ticket 02 §7's.

**Caveat that governs everything here: Atlas has no Anthropic account yet (ticket 11).** All
Claude prices below are PUBLIC LIST rates read from the live pricing page on 2026-08-12. No
negotiated discount, unknown rate-limit tier. Every number shows its arithmetic so the spec
(ticket 10) can re-derive per build slice.

---

## 1 · Verified price table (all fetched 2026-08-12)

### Claude tokens — <https://platform.claude.com/docs/en/about-claude/pricing>

| Model | Input /MTok | Output /MTok | Cache write 5m (1.25×) | Cache write 1h (2×) | Cache read (0.1×) |
| --- | --- | --- | --- | --- | --- |
| Haiku 4.5 | $1.00 | $5.00 | $1.25 | $2.00 | $0.10 |
| **Sonnet 5 (the default)** | **$2.00** | **$10.00** | $2.50 | $4.00 | $0.20 |
| Opus 5 | $5.00 | $25.00 | $6.25 | $10.00 | $0.50 |
| Fable 5 | $10.00 | $50.00 | $12.50 | $20.00 | $1.00 |

- **Sonnet 5's $2/$10 is now the STANDARD price, not introductory.** The pricing page states
  the planned increase to $3/$15 on 2026-09-01 "will not occur." This upgrades the ticket-02
  table, which had flagged $2/$10 as intro-through-August. One less sensitivity.
- **Tokenizer:** 4.7+ models (Sonnet 5 included) tokenize ~30% MORE tokens for the same text
  (pricing page note). The eval's token counts were calibrated at ~2.1 chars/token Hebrew on
  Gemini's tokenizer — so treat every Claude-side figure below as carrying a **+~30% Hebrew
  sensitivity** unless marked otherwise.
- Long context: 1M window at standard rates, no premium. Tool-use system prompt overhead on
  Sonnet 5: 354 tokens (`tool_choice: auto`) — noise at our scale.

### Server tools & Managed Agents — same page

| Item | Price | Notes |
| --- | --- | --- |
| Web search | **$10 per 1,000 searches** ($0.01/search) | Plus searched content billed as **input tokens** — in the search turn AND every later turn it stays in context. Errored searches not billed. |
| Web fetch | $0 | Content tokens only. |
| Managed Agents session runtime | **$0.08 per session-hour** | Beta. Metered to the ms, bills only `running` status — time spent `idle` waiting on OUR custom-tool round-trips is FREE. Replaces code-execution container billing. |
| Managed Agents tokens | Standard model rates; caching applies | **Batch discount does NOT apply** to sessions (stateful, no batch mode). Native per-session `budget` cap in cents at list rates. |
| Batch API (Messages only) | **50% off** input and output (Sonnet 5 → $1/$5) | Applies to our ingestion-time LLM work, never to interactive chat or agent sessions. |

### Gemini embeddings — <https://ai.google.dev/gemini-api/docs/pricing>

| Item | Price | Notes |
| --- | --- | --- |
| gemini-embedding-001 | **$0.15 / M input tokens** — **VERIFIED** (the eval carried this as unverified) | Input-only pricing. Batch tier: **$0.075/M** (50% off). Free tier exists but is rate-limited — budget on paid. |

---

## 2 · Cost per answer, per surface (Sonnet 5, list rates)

Shared assumptions: system prompt + tool schemas ≈ 5K tokens, byte-stable → almost always a
cache READ (the prefix is identical across all users, so it is warm org-wide); typical answer
= 2–4 model round-trips (tool_use → tool_result); Hebrew output 300–800 tokens + small
tool_use blocks ≈ ~1K output total; retrieval context per ticket 07 (top-20 ≈ 6–9K tokens;
whole-doc stuffing 6–40K; one call 6–18K).

### A · Chat pinpoint mode, big scope (top-k retrieval), 3 round-trips

Step inputs ≈ 6K → 13.7K → 16K (prefix grows by each tool result); total processed ≈ 36K.

| Line | Arithmetic | Cost |
| --- | --- | --- |
| Cache reads (warm system + growing prefix) | ~25K × $0.20/M | $0.005 |
| Cache writes (each step's new suffix) | ~11K × $2.50/M | $0.028 |
| Output | ~1K × $10/M | $0.010 |
| **Total** | | **≈ $0.04** (+30% Hebrew → ~$0.056; fully uncached worst case ≈ $0.08) |

### B · Chat pinpoint mode, small scope (stuff whole docs, 6–40K)

Usually one round-trip — the docs are injected, no tool loop.

| Scope | First turn (cold cache write) | Follow-up turns (cache read) |
| --- | --- | --- |
| 6K stuffed | (5K read + 7K write + 0.8K out) ≈ **$0.03** | ~13K read + out ≈ **$0.012** |
| 20K stuffed (typical) | 21K × $2.50/M + out ≈ **$0.06** | 26K × $0.20/M + out ≈ **$0.018** |
| 40K stuffed (router's ceiling) | 41K × $2.50/M + out ≈ **$0.11** | ~$0.02 |

The scope router's stuffing branch is the expensive first turn and the cheap conversation:
after turn 1 the whole document rides the cache at 0.1×.

### C · Chat search mode (market-wide, per-company-diversified top-k)

Shape A with a slightly larger tool result (~9K) and 2–3 round-trips ≈ **$0.05–0.08**.
Each web_search used: **+$0.01 fee + ~2.5K content tokens** (≈ $0.005 uncached, then cached).

### D · Ask Atlas on a live call / transcript (whole call injected, 6–18K)

| Call size | First turn | Follow-ups |
| --- | --- | --- |
| 6K | ≈ $0.02 | ≈ $0.01 |
| 12K (typical) | 13K write ≈ $0.033 + $0.008 out ≈ **$0.04** | 18K read ≈ **$0.015** |
| 18K | ≈ **$0.06** | ≈ $0.016 |

### E · Ask Atlas on a company page / Workspace chat

Tool-loop shape = A: **≈ $0.04–0.06 per answer.** A workspace turn that pulls a large shelf
via `read_workspace` degenerates to B's stuffing arithmetic (cap at the same 40K).

### F · An agent run on Managed Agents (~22 model steps, ~20 tool calls, ~5 min)

Ticket 02 §7's shape (5K system+schemas; ~2K avg tool result; final context ~50K; prefix
cached step-over-step — Managed Agents caches session history automatically):

| Line | Arithmetic | Cost |
| --- | --- | --- |
| Cache reads | ~600K × $0.20/M | $0.12 |
| Cache writes | ~60K × $2.50/M | $0.15 |
| Output | ~9K × $10/M | $0.09 |
| Token subtotal | | **$0.35** |
| Session runtime | 5 min = 0.083h × $0.08 | **$0.007** |
| Web search ×2 | 2 × $0.01 + ~5K content tokens | ~$0.03 |
| **Total** | | **≈ $0.39** · **+30% Hebrew ≈ $0.50** |

- Same shape on **Haiku 4.5 ≈ $0.19**, Opus 5 ≈ $0.92, Fable 5 ≈ $1.80 (tokens ×½/×2.5/×5).
- **Uncached, the input alone is ~660K × $2 ≈ $1.32** — caching is a 3–4× lever, not optional.
- The runtime fee is a rounding error at any plausible run length (30 min = $0.04, 1h =
  $0.08); tokens dominate ~50:1. Custom-tool waits are `idle` = unbilled.
- Anthropic's own worked example (pricing page): a 1-hour Opus 5 session, 50K in / 15K out,
  80% cached = $0.525 — consistent with this arithmetic.

---

## 3 · Ingestion cost

Embedding rate verified at $0.15/M ($0.075/M batch). Measured corpus densities: filing pages
≈ 741 tokens/page (2.29M tokens / 3,089 pages); a report averages ~110 pages (2,549 / 23).

| Item | Arithmetic | Cost |
| --- | --- | --- |
| One-time pass, corpus as it stands today | ~2.3M tokens × $0.15/M | **≈ $0.35** (measured, eval run) |
| Per new call transcript | 8–20K tokens × $0.15/M | **$0.001–0.003** — under a cent |
| Per filing page, embedding | 741 tokens × $0.15/M | **$0.00011** → $0.11 / 1,000 pages ($0.06 batch) |
| Per filing page, LLM contextual blurb (IF adopted — unmeasured increment, eval §"not measured") | Haiku batch: 741 in × $0.50/M + 100 out × $2.50/M | **$0.0006** → $0.62 / 1,000 pages |

### MAYA filings at scale (ticket 17 hasn't decided scale — assumptions stated per scenario)

234 companies; ~110 pages per periodic report (measured); presentations assumed ~20 pages.

| Scenario | Assumption | Pages | Embedding ($0.15/M) | + Haiku-batch blurbs |
| --- | --- | --- | --- | --- |
| **Low** | 1 year back, periodic reports only (4/company/yr) | 234 × 4 × 110 ≈ **103K** | 76M tok ≈ **$11** ($6 batch) | +$62 |
| **Mid** | 3 years, reports + presentations | 234 × (12×110 + 8×20) ≈ **346K** | 257M tok ≈ **$39** ($19 batch) | +$208 |
| **High** | 5 years + immediate disclosures | ~**600K** | 445M tok ≈ **$67** ($33 batch) | +$360 |

- **Embedding is never the cost story — even the High backfill is under $70.** The open cost
  question is the **Hebrew PDF extraction pipeline** (W5 / ticket 17): plain text extraction
  (today's `ingestFiling` path) is ~$0; anything LLM-per-page multiplies by the blurb column.
- Ongoing: ~90 new filings/month average (234 × ~4–5/yr, bursty at earnings season) ≈ 10K
  pages/mo → **~$1/mo embedding, ~$6/mo blurbs**. Negligible.
- Non-API footnote: 1536-dim vectors ≈ 6.1KB each; the High scenario ≈ 600K chunks ≈ ~3.7GB
  in pgvector — a Supabase plan consideration, not an API cost.

---

## 4 · Monthly scenarios

Assumed usage **per fund per working day** (22 days/mo), for the founder to correct:

| Band | Chat/Ask Atlas answers | Agent runs | Web searches | Per fund / day | Per fund / month |
| --- | --- | --- | --- | --- | --- |
| Cheap | 4 × $0.04 | 1 × $0.25 (short/Note-Taker-ish) | 1 | ≈ $0.42 | **≈ $9** |
| Typical | 10 × $0.05 | 2 × $0.45 | 3 | ≈ $1.45 | **≈ $32** |
| Heavy | 30 × $0.06 | 5 × $0.50 | 10 | ≈ $4.40 | **≈ $97** |

| Funds | Cheap | Typical | Heavy |
| --- | --- | --- | --- |
| 5 | ~$45/mo | **~$160/mo** | ~$490/mo |
| 30 | ~$270/mo | **~$960/mo** | ~$2,900/mo |
| 100 | ~$900/mo | **~$3,200/mo** | ~$9,700/mo |

Plus: one-time ingestion backfill $10–430 depending on ticket 17's scenario; ongoing
ingestion <$10/mo; Gemini embedding queries negligible (~30 tokens/query). Hebrew +30%
applies to the Claude portion → treat the Typical column as $30–42/fund/mo.

**Rate-limit tier collision (feeds ticket 11):** a new Anthropic org starts at the Start tier
with a **$500/month spend cap** (`research/02-agent-sdk.md` §8) — that binds at ~15 funds on
Typical usage. 30 funds needs Build ($1,000 cap); 100 funds needs Scale. The account setup
should plan the tier path, not just the key.

---

## 5 · Proposed budgets — for the founder to veto or approve

In plain language: **at list prices, one fund on typical daily use costs about $30–45 a month
in AI.** A single chat answer costs about 5 agorot' worth of dollars (~$0.05, ~₪0.18); a full
agent run costs about half a dollar. The proposed hard numbers every build slice must show
its arithmetic against:

| Budget | Typical | Hard cap | Enforced by |
| --- | --- | --- | --- |
| Chat / Ask Atlas / Workspace answer | **≤ $0.05** | **≤ $0.15** | context budgets (40K stuffing ceiling, top-20 retrieval), `max_tokens`, round-trip cap (~4) |
| First turn on a large stuffed document | ≤ $0.12 | ≤ $0.15 | the scope router's 40K ceiling |
| Agent run (Sonnet 5, standard mission) | **≤ $0.50** | **≤ $1.00** | Managed Agents native session `budget` = "100" cents — platform-enforced pre-request gate |
| Note Taker / short mechanical run | ≤ $0.25 | ≤ $0.50 | same, "50" |
| Per fund, monthly | ~$35 | **alert at $100** | our accounting (below) |
| Monthly envelope | 5 funds ≤ $250 · 30 funds ≤ $1,200 · 100 funds ≤ $4,000 | | monthly reconciliation vs Console |
| Ingestion backfill (one-time) | per ticket 17 scenario | ≤ $500 all-in | batch API + batch embeddings |

**Accounting is part of the budget, not an afterthought:** every run row and chat request
stores its usage (Managed Agents: `session.usage.list_cost` is the authoritative per-session
figure at list rates; Messages API: the `usage` block per response), reconciled monthly
against the Console — client-side estimates must never be billed onward (ticket 02 §7).

---

## 6 · Ranked efficiency levers (the founder's "how can we make them the most efficient")

1. **Prompt caching — mandatory, worth 3–4× on agents.** The measured agent run is $0.35
   cached vs ~$1.4+ uncached; a chat answer ~$0.04 vs $0.08. Requirements: byte-stable system
   prompt + tool list (volatile facts go last), and cache reads also don't count toward input
   rate limits (~5× effective throughput). Managed Agents caches sessions automatically; our
   chat loop must be built cache-first.
2. **Scope routing (already decided, ticket 07).** Top-k retrieval caps answer context at
   6–9K tokens vs up to 40K stuffed — ~4× on the input line for big scopes, while small
   scopes get the better answer cheaply. The router IS the cost control for surface B/C.
3. **Tool results = anchored windows, never documents.** The agent run's cost scales almost
   linearly with average tool-result size (~2K assumed). One tool that returns a 20K document
   instead of anchors adds ~$0.05–0.45/run depending on step count. The `search_corpus`
   returns-windows-with-anchors contract is a budget mechanism, not just a citation one.
4. **Model tiering.** Haiku 4.5 halves+ the agent run ($0.19 vs $0.35–0.50) — per ticket 08
   Haiku is allowed only for mechanical internal steps, never user-facing answers; revisit
   per-agent step-down once real missions exist. Opus/Fable only by explicit future decision
   (×2.5/×5).
5. **Per-run budget caps — native and cheap to adopt.** Managed Agents `budget` (dollar cap
   in cents, list-rate metering, pauses the session rather than killing it) plus our
   `maxBudget` column. Caps convert tail-risk (a runaway 100-step run) into a bounded $1.
6. **Batch API (50%) where it applies: ingestion only.** LLM extraction/blurbs and re-embeds
   run as batches (Sonnet 5 at $1/$5, Haiku at $0.50/$2.50; Gemini embeddings at $0.075/M).
   Never applicable to chat or Managed Agents sessions.
7. **Embedding dimension fixed @1536 (decided)** — and embedding cost is negligible at every
   scale measured, so there is nothing further to win here.
8. **1-hour cache TTL for scheduled agent fleets** (2× write instead of 1.25×) — pays off
   when ≥2 runs share a prefix within the hour; relevant once many agents run on the same
   corpus prefix at the same cron window. Stagger crons regardless (rate-limit acceleration).
9. **Web search under the archive-first instruction (decided, ticket 08).** The $0.01 fee is
   minor; the real cost is search content persisting as input tokens in every later turn —
   archive-first keeps searches to genuinely-external questions.

---

## 7 · Sensitivities & unknowns

- **Hebrew tokenizer overhead, +~30%** on all Claude token arithmetic (4.7+ tokenizer,
  pricing-page note). The eval's counts were Gemini-calibrated; re-baseline with
  `count_tokens` on real Hebrew prompts once the account exists (ticket 11).
- **Managed Agents pricing is beta** ($0.08/session-hour "may change", no SLA) — the exposure
  is small (runtime ≈ 2% of a run's cost), but GA terms should be re-checked.
- **No account → unknown tier** (ticket 11). Start tier's $500/mo cap binds at ~15 funds
  typical; plan the Build→Scale path with the account.
- **Web-search usage rate is a guess** (3/fund/day typical). At $0.01 + content tokens it
  moves the monthly figure by single-digit percent even at 3× the guess.
- **The extraction pipeline (ticket 17 / W5) is the largest undecided ingestion cost** —
  $0 (plain text) to ~$360 (LLM blurbs, High scenario). The LLM-blurb retrieval gain is also
  still unmeasured (eval §"not measured") — measure before paying for it.
- **Usage assumptions in §4 are proposals, not observations** — no fund uses the product yet.
  The budgets in §5 are set so the Typical band holds even if actuals land 2× higher.
- **Resolved since ticket 02:** Sonnet 5 $2/$10 is permanent (increase cancelled); the
  gemini-embedding $0.15/M figure is verified.
