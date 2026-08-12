# Anthropic account + API key for Atlas

Type: task
Status: claimed

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
