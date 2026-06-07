# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

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
