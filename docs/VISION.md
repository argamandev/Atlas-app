# Atlas — Vision & Roadmap

> Moved out of CLAUDE.md (2026-07-02) so sessions load it only when needed.
> The live mission status lives in `agent-memory/BOARD.md`; decisions in `PROGRESS.md`.

## The big vision

**Atlas** is building the best product for the Israeli public market and its financial
institutions — think **Quartr, but Hebrew-native and institutional-only** (no retail). The core
problem: during report season every hedge fund drowns in 200+ investor calls in a few weeks.
The product lets institutional investors track, consume, and extract insights from **every**
Israeli public company's investor calls — live and after the fact — so they can outperform.
Atlas also innovates in how insight is delivered from the Israeli public market: **Chat, a
Workspace for agentic document analysis, and Agents** working for the user.

Concretely:
- **A profile for every Israeli public company** (via the TASE/MAYA API), with its quarterly-call
  Zoom links, report PDFs and slide decks collected automatically.
- **Live transcripts**: a Recall.ai bot joins every call; users watch on-platform — audio +
  Hebrew captions in sync (~4–5 min buffer embraced by design).
- **Finished transcripts**: when a call ends, the same call matures in place into the polished
  transcript (IVRIT/Recall → Gemini formatting), stored forever.
- **The multi-view experience** (in build): transcript + quarterly report PDF + slides side by
  side while the call plays — every panel markable, every marked passage Ask-Atlas-able.
- **Zoom webinars** as a first-class call type beside quarterly calls (Home shows live +
  quarter for calls; live + "Zoom webinar" + short description for webinars).
- **Many simultaneous calls** — report-season architecture from day one.

Origin story: started as a tool for the founder's brother at a hedge fund; the fund manager's
feedback was so strong they partnered. Adoption strategy: prestige, high-end institutional
users only. UI: English-LTR with full Hebrew-RTL option; quality and polish matter.

## The V1 product (shipped surface)

Three-layer sidebar (icon rail → expanded panel → content), Mac-window frame, warm cream
palette, IBM Plex Sans Hebrew. Pages:

- **Home** — greeting, company search (company = the atomic unit), "Live Now" auto-detect,
  upcoming calls by date.
- **Calendar** — month view of upcoming calls; "All calls" vs "My Calendar" (follow).
- **Chat** — streaming LLM chat over the transcript DB (Gemini 3.5 Flash, GPT-4.1 fallback,
  markdown + content-driven RTL); `/company` scoping; history; quotes flow in as references.
- **Company page** — header (name/logo/sector), Overview tab (latest call incl. the just-ended
  in-flight call, upcoming, My Quotes by quarter + folders), Investor Calls tab (backlog),
  "Add Investor Call" (YouTube link → pipeline), admin rename/delete.
- **Live Transcript page (the crown jewel)** — karaoke transcript synced to audio; live =
  buffered broadcast (join at the live edge, audio follows you across pages via the global
  live bar + "Return to live" chip; source ends → buffer drains at 1× → auto-swaps in place
  to the organized transcript); finished = replay with click-word-to-seek, quote-save,
  share, Ask Atlas side chat, diarization editing overlay.
- Global persistent audio players (recorded + live) in the app shell; profile/settings.

Incoming from Claude Design (Mission 3): improved chat frontend (New chat / Projects /
Workspace / Agents), the **Workspace** page (agentic multi-document analysis) and the
**Agents** page (create/assign/talk to standing agents — "the wow effect") — frontend-first,
stub data until their backends arrive.

## Roadmap — core missions

The product process: MAYA API → company profiles + call links + report PDFs/slides →
Recall bots join calls → live transcript on-platform → call ends → polished transcript →
stored forever. On top: chat, multi-view, workspace, agents.

1. **Core 1 — Live transcript** ✅ proven end-to-end on real Zoom calls (see PROGRESS.md).
   Locked pipeline: Recall bot (`recallai_streaming`/`prioritize_accuracy`/`auto`) → realtime
   webhook (`transcript.data`) + websocket (`audio_mixed_raw.data`) → Gemini live correction
   (company-context, fix-words-only, `thinkingBudget: 0`) → buffered broadcast. Engine:
   `scripts/live-broadcast.mjs`; replay: `scripts/live-replay-engine.mjs`.
   Production to-build: sentence-level correction with anchor alignment; copy recording +
   transcript to our storage post-call; permanent webhook URL; `live_calls` table +
   multi-call concurrency; live speaker capture (captions are currently one speakerless
   block — capture Recall's per-word participant → real speaker segments). **Mission 4 adds: the independent IVRIT pipeline (Recall sends
   audio-only → RunPod IVRIT → text + word timestamps) as a second engine.**
2. **Core 2 — Automatic bot fleet from MAYA.** Quarterly-call announcements (Zoom links +
   times) per company → auto-create Recall bots → feed Core 1. Hard part learned 2026-06-15:
   Zoom registration tokens are single-use and short-lived — the fix is a tight
   auto-register → grab fresh `tk` → launch bot pipeline (token never human-touched).
   TASE onboarding: `Atlas Documents/MAYA API/` (10 req/2s rate limit; disclosure products
   need Data Sales approval — in progress).
3. **Core 3 — Finished transcript** ✅ complete (IVRIT → Gemini 3.5 Flash company-aware
   holistic prompt → structured transcript; persisted-before-format → cheap reformat).
   Deliberate leftovers: per-company entity DB; IVRIT confidence scores; per-line `startSec`.
4. **Mission 4 — Multi-view investor call**: transcript + MAYA report PDF + slides subpanels,
   mark-text + Ask Atlas in every panel (see the 2026-07-02 build brief and
   `docs/superpowers/specs/2026-07-02-smart-environment-design.md` §Goal).
5. **Mission 5+ — the per-company knowledge wiki (the intelligence layer).** Karpathy's
   LLM-wiki pattern as Atlas's moat: every finished transcript + every MAYA report is
   INGESTED into a maintained per-company knowledge page (people, dated guidance claims,
   recurring topics, contradictions flagged across quarters — "compiled once, kept current").
   Chat reads the compiled knowledge before raw context-stuffing; Agents stand on it; Ask-Atlas
   answers get filed back into it. **Design hook for Mission 4 (Lane M): shape the `documents`
   table and `src/lib/chat/context.ts` so a `company_knowledge` layer can slot in behind a
   clean interface later — interface now, implementation at Mission 5.** This is the same
   architecture as our dev smart environment (docs/ENVIRONMENT.md §6) — deliberately so.

## Transcript-quality gate

The **`/transcript-review`** skill audits real transcripts (batch via
`scripts/transcribe-batch.mjs`, Bearer auth `REVIEWER_EMAIL`/`REVIEWER_PASSWORD`; audits every
line for typos/proper-nouns/speaker/bidi). Gold measurement: `scripts/run-experiment.ts` +
`scripts/lib/measure-core.ts` diff a candidate against the human gold
(`scripts/fixtures/ampa-q1-2026.gold.txt`) → *fixed / introduced / remaining* token errors.
Current pipeline: visually excellent; ~40 token-errors on אמפא (quality-over-metric was a
deliberate call — see PROGRESS 2026-06-10). Source-side IVRIT biasing: closed, proven no-op.

## Brand

**Atlas** (Hebrew UI: **אטלס**), rebranded from תמלול/Timlul 2026-06-15. Latin wordmark via
`public/brand/atlas-wordmark.png` (`BrandWordmark` DS component, CSS-mask currentColor);
regenerate with `node scripts/prep-brand-assets.mjs`. Note: "תמלול" is also the everyday
Hebrew noun for "transcript" — only brand-name uses were renamed. The old `timlul-ai.com`
domain still serves the legacy product from the frozen repo.
