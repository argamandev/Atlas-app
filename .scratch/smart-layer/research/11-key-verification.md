# Ticket 11 — Anthropic key verification

Ran: 2026-08-12T20:46:09.964Z · model: `claude-sonnet-5` · script: `scripts/anthropic-verify.mjs`

## Metered call

- HTTP 200, message id `msg_011CdyWTt4oYHKppsgpU4icU`, stop_reason `end_turn`
- Answer: **פריז**
- Usage: {"input_tokens":30,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0},"output_tokens":7,"output_tokens_details":{"thinking_tokens":0},"service_tier":"standard","inference_geo":"global"}

## Rate-limit headers (the org's live limits for claude-sonnet-5)

- `anthropic-ratelimit-input-tokens-limit`: 10000000
- `anthropic-ratelimit-input-tokens-remaining`: 10000000
- `anthropic-ratelimit-input-tokens-reset`: 2026-08-12T20:46:09Z
- `anthropic-ratelimit-output-tokens-limit`: 2000000
- `anthropic-ratelimit-output-tokens-remaining`: 2000000
- `anthropic-ratelimit-output-tokens-reset`: 2026-08-12T20:46:10Z
- `anthropic-ratelimit-requests-limit`: 10000
- `anthropic-ratelimit-requests-remaining`: 9999
- `anthropic-ratelimit-requests-reset`: 2026-08-12T20:46:08Z
- `anthropic-ratelimit-tokens-limit`: 12000000
- `anthropic-ratelimit-tokens-remaining`: 12000000
- `anthropic-ratelimit-tokens-reset`: 2026-08-12T20:46:09Z

**Inferred tier:** Scale (or custom) — per the Start/Build/Scale table in
`.scratch/smart-layer/research/02-agent-sdk.md` §8. The founder-confirmed tier from the
Console limits page is appended below by the wizard.

## Hebrew token re-baseline (count_tokens, claude-sonnet-5)

- Sample: 128-word concatenation of the 16 real eval questions
  (`docs/eval/retrieval-eval-set.md`)
- 723 chars → **504 tokens** → **1.43 chars/token** for Hebrew on claude-sonnet-5
- Replaces the pricing-page +30% assumption in `research/09-cost-budgets.md` — recompute the
  per-answer arithmetic with this measured figure when the spec (ticket 10) is written.
- Context for the correction: the workspace token estimator (`plan.ts`) calibrated Hebrew at
  2.1 chars/token; 1.43 measured means Hebrew costs ~47% more tokens than that estimate —
  MORE than the +30% research/09 assumed. Caveat: the sample is short interrogative
  sentences; re-measure on long transcript prose during ticket 16 if precision matters.

## Founder-confirmed tier (Console → Rate limits page, screenshot 2026-08-12)

**Evaluation tier** — the official record. Per-model limits shown:

| Model | RPM | ITPM (excl. cache reads) | OTPM |
| --- | --- | --- | --- |
| Claude Opus 5 / Sonnet 5 / Opus 4.x / Sonnet 4.x / Haiku 4.x | 1K | 500K | 80K |
| Claude Fable 5 | 50 | 100K | 20K |

Plus: batch requests 50/min across models · web search 30 uses/sec · Files API 500 GB.
Monthly spend cap not shown on this page — check Billing before heavy prototyping.

**⚠ Header/Console discrepancy, recorded per M1:** the same org's live response headers
(above) reported `requests-limit: 10000`, ITPM 10M, OTPM 2M — an order of magnitude above
the Console's Evaluation numbers. The headers answer "what bucket did this request draw
from", not "what tier is the org on"; the Console page is the tier of record. Do NOT infer
tier from headers again — the script's "Scale (or custom)" guess was wrong.

## Consequences for the smart layer

- The org is BELOW the Start tier research/09 budgeted around. The Start($500/mo cap,
  ~15 funds) → Build($1,000) → Scale path is still ahead; tiers advance with billing
  history and usage. Fine for all prototyping; revisit before onboarding real funds.
- Evaluation-tier binding constraints for prototyping: **80K output tokens/min** on the
  Sonnet-5 bucket (agent runs are output-heavy), and Fable 5 at 50 RPM if ever used.
- Key lives in `.env.local` as `CLAUDE_API_KEY` (accepted alias; canonical name is
  `ANTHROPIC_API_KEY`, which the SDK auto-detects — use that name when adding the
  Railway variable). Railway variable NOT yet set — nothing in production calls Claude
  yet; add it with the first Claude-powered ship.
