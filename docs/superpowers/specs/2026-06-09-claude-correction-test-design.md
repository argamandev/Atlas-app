# Claude-based Transcript Correction — Test Spec (V1 + V2)

**Date:** 2026-06-09 · **Branch:** `feat/correction-v2`
**Goal:** A/B test **Claude Sonnet 4.6** as the post-IVRIT correction brain (vs GPT-4o/5.5, which over-reached), on the *same* stored IVRIT raw transcript, and produce **viewable** transcripts on the site for אמפא — V1 (no report) and V2 (+ report) — scored against the gold.

## Why
GPT over-reached: hallucinated, auto-corrected valid words, weak context coherence; the report-as-entities helped only modestly. Claude tends to be more conservative + better at "leave it exactly as-is" — worth a clean test. Finish line: if Claude is cleaner (fewer introduced, honest flags, looks good) it becomes the correction model; otherwise we keep current. Either way this feature is **done** after V1+V2.

## The #1 rule (non-negotiable)
Claude **never rewrites or summarizes**. It returns a **diff only** — a list of specific word/term changes. We apply those exact replacements to the raw text; everything else passes through **byte-identical**. Uncertain words + all numbers are **flagged (colored yellow), never changed**.

## Architecture (Approach A — Claude does the brain, single-pass)
Claude Sonnet 4.6, one call over the **whole** transcript (200K context easily fits it). Returns structured JSON:
- `profile`: { company, quarter, year, business } — inferred from the text.
- `corrections`: `[{ original, corrected?, kind: name|homophone|number, certainty: confident|uncertain, reason }]` — **diff only**.
- `speakers`: who-said-what segmentation (organization only; no word changes).

Then deterministically (reuse existing machinery):
- `confident` (non-number, safe) → applied by exact string replace.
- `uncertain` + every `number` → collected as yellow flags (≤ a few words each).
- Build `formatted_data` (company/quarter/speakers/sections[].lines[] + flags).

## V1 vs V2
- **V1:** Claude input = raw transcript only.
- **V2:** Claude input = raw transcript **+ full report text** (`ampa-q1-2026.report.txt`, ~42K tokens) for authoritative names/numbers/business.

## Delivery & measurement
- Run both **offline on the saved IVRIT raw** (no re-IVRIT), build `formatted_data`, **insert 2 rows**: `ampa-claude-v1`, `ampa-claude-v2`.
- Links on local dev: `localhost:3000/transcript/ampa-claude-v1` and `…-v2`. Original אמפא row untouched. Yellow flags rendered by existing UI.
- Print **gold-diff score** (fixed / introduced / remaining) for each, vs GPT baselines (memory 31, merged 30, curated 28).

## Files
| File | Responsibility |
|---|---|
| `src/lib/correction-claude.ts` | **new** — Anthropic SDK client (model `claude-sonnet-4-6`, key `CLAUDE_API_KEY`); `correctWithClaude(rawText, opts)` → `{ profile, corrections, speakers }`; reuse `routeItems` to apply/flag |
| `scripts/claude-test.ts` | **new** — run V1 + V2, build `formatted_data`, insert rows via `supabaseAdmin`, print gold-diff scores |
| `package.json` | add `@anthropic-ai/sdk` |

## Out of scope
- Wiring Claude into the *live* production pipeline (only if Claude wins the test).
- The future "live transcripts via recall.ai" feature.

## Done = Claude V1 + V2 are viewable on the site (yellow-flagged) + scored vs gold, so we can judge if Claude beats GPT. Implementation must consult the **claude-api** skill for exact SDK usage.
