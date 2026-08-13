# Anthropic account + API key for Atlas

Type: task
Status: resolved

## Question

Atlas has no Anthropic account, key, or org today (the SDK research, ticket 02, flagged it:
brand-new third vendor, Evaluation-tier org until real usage). Before anything
Claude-powered can be prototyped or costed for real: create the Anthropic org for Atlas,
generate an API key, store it in the Railway environment and local `.env` (never in git),
and record the org's rate-limit tier. The founder does the signup (HITL, billing); the
session hands him a precise checklist and verifies the key works with one metered call.
Needed before the retrieval eval (07) can price Claude-side designs and before any agent
prototype.

**Added by ticket 09 (2026-08-12):** plan the rate-limit tier path, not just the key — a
new org's Start tier carries a **$500/month spend cap**, which binds at ~15 funds on
typical usage (~$32/fund/mo); 30 funds needs Build ($1,000), 100 needs Scale. Also on the
checklist once the key exists: re-baseline the Hebrew token arithmetic with `count_tokens`
on real prompts (the +30% overhead in `research/09-cost-budgets.md` is a pricing-page
figure, not our measurement).

## Comments

**2026-08-12 (session, ticket claimed):** the founder's side is prepared, waiting on him.

- `scripts/anthropic-setup-wizard.sh` — interactive walkthrough (Git Bash): Console
  signup → billing → API key into git-ignored `.env.local` → Railway variable →
  verification. Run with `bash scripts/anthropic-setup-wizard.sh`.
- `scripts/anthropic-verify.mjs` — the verification the ticket requires: one metered
  `claude-sonnet-5` call, live `anthropic-ratelimit-*` headers → inferred tier, and the
  Hebrew `count_tokens` re-baseline on the 16 real eval questions. Results (no secrets) →
  `.scratch/smart-layer/research/11-key-verification.md`. The wizard runs it in stage 5;
  it can be re-run alone any time.
- Deliberate shape: `.env*` is deny-listed for agent sessions, so the key is typed and
  verified entirely in the founder's terminal — it never passes through a Claude session.
- Tier path (from `research/02-agent-sdk.md` §8 + `research/09-cost-budgets.md` §7):
  Evaluation → **Start** ($500/mo cap — binds at ~15 funds) → **Build** ($1,000, ~30
  funds) → **Scale** (100 funds). Tiers advance automatically with usage/spend history;
  the thing to do NOW is only to note which tier the org lands on after billing is added.

Resolves when the wizard has run, the key is verified, and the tier is recorded — then
this session (or the next) files the Answer from `11-key-verification.md`.

## Answer

Resolved 2026-08-12. The founder already had an Anthropic account and had stored a key —
no new org was created; the wizard's signup stages were skipped and only verification ran.

1. **Key: live and verified.** One metered `claude-sonnet-5` call succeeded (HTTP 200,
   answer "פריז", `stop_reason: end_turn`). Key is in git-ignored `.env.local` as
   `CLAUDE_API_KEY` — accepted alias; the canonical name is `ANTHROPIC_API_KEY` (the SDK
   auto-detects it). **Railway variable not yet set, deliberately** — nothing in
   production calls Claude; add `ANTHROPIC_API_KEY` there with the first Claude ship.
2. **Tier of record: Evaluation** (Console Rate-limits page, founder screenshot).
   Sonnet-5 bucket: 1K RPM · 500K ITPM (excl. cache reads) · **80K OTPM** (the binding
   constraint for output-heavy agent runs); Fable 5: 50 RPM · 100K ITPM · 20K OTPM;
   batch 50 req/min; web search 30/s; Files 500 GB. The Start($500/mo, binds ~15
   funds) → Build($1,000) → Scale path is still AHEAD of us — tiers advance with billing
   and usage; revisit before onboarding real funds, fine for all prototyping.
   ⚠ Live response headers claimed 10K RPM / 10M ITPM — do not infer tier from headers;
   the Console page is the record (full discrepancy note in the fact sheet).
3. **Hebrew token arithmetic re-baselined** (`count_tokens`, the 16 real eval questions):
   **1.43 chars/token on Sonnet 5** — Hebrew costs ~47% more tokens than the 2.1
   chars/token estimator (`plan.ts`), exceeding research/09's +30% assumption. Ticket 10
   recomputes the cost arithmetic with the measured figure.

Fact sheet: [`research/11-key-verification.md`](../research/11-key-verification.md) ·
tools kept for reuse: `scripts/anthropic-verify.mjs` (re-run any time),
`scripts/anthropic-setup-wizard.sh` (signup stages unused, kept for a future second org).
