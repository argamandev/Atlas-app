# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

---

## 2026-06-09 — Locked the correction pipeline (Feature 1 baseline) + Claude experiment

- **Locked the constrained, gold-measured correction layer** (`src/lib/correction.ts`) as the product's
  correction step. `formatWithGPT4o` Step 0 = `generateEntities` (knowledge-first auto entity list,
  GPT-4o) → `correctTranscript` (**diff-only**, entity-guarded, context-coherence flags) → speaker-tag
  the raw text + apply corrections per line (decoupled). Best measured: אמפא **46→31 token-errors, 0
  introduced**. The diff-only output + entity-match guard (`applyConfident`) is what stops the over-reach
  that plagued the old free-rewrite GPT pass.
- **Claude Sonnet 4.6 experiment — tested, did not win.** Same IVRIT raw, swapped only the correction
  brain (`scripts/claude-test.ts`). V1 (no report) 46→41, 1 introduced; **V1 + adaptive thinking 46→39,
  2 introduced** (Claude's best) — still short of GPT-4o+entities (31), and it corrupts 1–2 good words.
  Report-as-context is a **dead end for both models** (no-thinking V2 over-reached → 5 introduced;
  thinking-V2 ran the 50K-token report away and burned the whole budget). **Verdict: the entity list is
  the lever, not the model.** Claude's *flagging* (detection) was excellent, though. Spec:
  `docs/superpowers/specs/2026-06-09-claude-correction-test-design.md`.
- **Feature 1 is "good-enough" DONE** (product call): clean + honest yellow flagging + speaker
  organization. Explicitly **not** perfect — we will return to it; this pipeline is the core of the product.
- **Revisit-later list (deliberate):** per-company canonical entity DB + cross-company learning loop
  (biggest remaining lever); IVRIT per-word confidence + audio for the genuinely-ambiguous residual
  (e.g. cap-rate היוון/רבעון); a Claude pass once we have a Claude-tuned prompt. Source-side IVRIT
  biasing stays closed (proven no-op).
- **Misc:** added `@anthropic-ai/sdk` (also serves the upcoming live-transcripts feature); admin
  "תמלל מחדש" button + backend force-path inserts a new row so the original is kept for A/B.

---

## 2026-06-07 — Cleanup, foundations & the transcript-quality gate

- **Purged the abandoned "insider transactions" feature** (full purge). Deleted 11 `src/` files,
  the entire `worker/` dir (`maya-poller` cron), `render.yaml`, the `resend` dependency, dead
  `mock-data.ts`, and insider-only env vars (`RESEND_*`, `GREEN_API_*`, `CRON_SECRET`). The feature
  was fully isolated — nothing in the transcript product imported it. DB tables left in place
  (harmless, reversible). Verified `tsc` + `next build` clean afterward.
- **Reverted the font-size bump** from commit `3c51315` — only the `fontSize` block in
  `tailwind.config.ts`, back to its prior values. Left accent color and `font-mono-num` (changed in
  the same commit) alone; the complaint was size only.
- **Added `CLAUDE.md` and this `PROGRESS.md`** — the project had neither. CLAUDE.md is the
  per-session memory; PROGRESS.md is the decision log.
- **Built the transcript-quality gate**: Bearer-token auth on the transcript API (so automation can
  drive the real product), `scripts/transcribe-batch.mjs` (submits a URL list, polls, dumps results),
  and the **`/transcript-review`** skill that audits output for Hebrew typos/speaker errors and feeds
  `KNOWN_CORRECTIONS`. Feature 1 is now gated on a clean reviewer report. Reviewer runs against the
  local dev server.
- **Skills decision**: build exactly one (`/transcript-review`). Code review uses the built-in
  `reviewer` agent — no skill needed.

---

## Earlier milestones (pre-log, summarized)

- **Security hardening**: auth on `GET /api/transcripts`, RLS on `transcripts`, removed plaintext
  password storage from the join flow (now `inviteUserByEmail`), fixed an open redirect.
- **Database user-creation bug**: fixed the `handle_new_user` Supabase trigger (wrong columns +
  `search_path`).
- **Rebrand** "Sentiment." → **"תמלול."** across the app.
- **Sign-out**: replaced a dropdown with a plain `<a href="/api/auth/signout">` after a z-index
  overlap kept intercepting the click.
- **Inline transcript editing**: company/quarter/speakers (with app-wide name sync) + line text +
  highlights, saved via `PUT /api/transcripts/[id]`.
- **Unified navbar** (`AppNav`), **Companies** accordion page, dashboard refactor, join form fields.
- **Transcription quality phase 1**: engine/model tracking + admin badge; wired the previously-dead
  `KNOWN_CORRECTIONS` + GPT proofread pass; Whisper fallback on IVRIT failure. IVRIT confirmed
  running in production via the badge (`ivrit · …turbo-ct2`).
