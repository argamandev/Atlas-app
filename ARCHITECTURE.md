# ARCHITECTURE.md — Atlas codebase map

> **What this is:** a plain-language tour of the code, file by file — *where things live* and
> *what each piece does*. For the *why* behind big decisions, see `CLAUDE.md` (project rules) and
> `PROGRESS.md` (decision log). This doc is a living map — when we change structure, we update it.
>
> **As of 2026-07-02 the repo is Atlas-only.** The legacy Timlul product was deleted (Wave 1,
> see `LEGACY.md`); the only legacy left is the 4-file login gateway at `/` (Wave 2, kept until
> Atlas ships its own login).

---

## 1. The big picture

**One product: Atlas**, living under **`/app/*`** — Home / Calendar / Chat / Company / Live pages
in a three-layer sidebar shell. The `/` route is a login gateway (legacy-styled, temporary);
logging in lands you at `/app/home`.

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth + Storage) · Tailwind ·
Railway (deploys from the old repo for now; this clone develops on localhost). Transcription:
IVRIT (RunPod) → Gemini 3.5 Flash. Chat: Gemini 3.5 Flash (GPT-4.1 fallback).

**Supabase is shared with the old frozen repo** — additive migrations only, flag any DB change.

---

## 2. The three core data flows (the "spine")

Understanding these three flows is 90% of understanding the app.

### A. Finished transcript (paste a link → polished transcript)
```
POST /api/transcripts          (src/app/api/transcripts/route.ts)
  → inserts a `transcripts` row, then fires runPipeline() in the background
  → getVideoInfo → downloadAudio → transcribeAudio (IVRIT/Whisper)
  → formatTranscript (Gemini 3.5 Flash)        (src/lib/transcription.ts)
  → saves formatted_data + status='completed'
GET /api/transcripts/[id]      ← poll for status/progress
View: /app/live/[id] (loadCompletedCall → LiveTranscriptView, karaoke word-sync)
```

### B. Live call (the crown jewel)
```
Recall.ai bot joins Zoom → Recall engine (scripts/live-broadcast.mjs)
                         OR IVRIT engine (scripts/live-ivrit-broadcast.ts)
  → raw captions / PCM chunks → corrected/transcribed, buffered ~5 min
Browser: /app/live/[id] → LiveSession → LiveBroadcastView (karaoke captions synced to audio)
  → audio survives navigation via LiveAudioProvider + GlobalLiveBar
  → source ends → buffer drains at 1× → finish pipeline runs
  → auto-swaps in place to the organized finished transcript
Hand-off to a normal transcript row: src/lib/live/finishLiveCall.ts
Proxy routes the browser talks to: /api/live/state, /api/live/finish, /api/live/pcm
```

### C. Chat over the transcript DB
```
/app/chat  → ChatView → POST /api/chat
  → builds context from transcripts (src/lib/chat/context.ts)
  → streams Gemini 3.5 Flash tokens (SSE) back to the browser, markdown-rendered
```

---

## 3. Routes — `src/app/`

### Atlas pages (under `/app/*`)
| File | Route | What it does |
|---|---|---|
| `app/app/layout.tsx` | `/app/*` | **The persistent shell.** Mac window frame + nav rail + the two global audio providers (recorded + live) so audio survives navigation. |
| `app/app/page.tsx` | `/app` | Redirects to `/app/home`. |
| `app/app/home/page.tsx` | `/app/home` | **Home** — greeting, company search, "Live Now", upcoming calls. |
| `app/app/calendar/page.tsx` | `/app/calendar` | **Calendar** — month view of all upcoming calls. |
| `app/app/chat/page.tsx` | `/app/chat` | **Chat** — LLM chat over the transcript DB. |
| `app/app/company/[id]/page.tsx` | `/app/company/[id]` | **Company page** — header, Overview + Investor-Calls tabs, My Quotes. |
| `app/app/live/[id]/page.tsx` | `/app/live/[id]` | **Live transcript page** — live karaoke AND finished replay (one view, two modes). |
| `app/app/workspace/page.tsx` | `/app/workspace` | **Workspace** — design-demo workspace view. |
| `app/app/agents/page.tsx` | `/app/agents` | **Agents** — design-demo agents view. |
| `app/app/settings/page.tsx` | `/app/settings` | Profile & settings. |

### Gateway + shared
| File | Route | What it does |
|---|---|---|
| `app/page.tsx` | `/` | ⚠️ GATEWAY — login/landing (legacy-styled; Wave 2, see `LEGACY.md`). Login → `/app/home`. |
| `app/print/[id]/page.tsx` (+ `PrintTrigger.tsx`) | `/print/[id]` | Print-friendly transcript (Hebrew PDF stopgap via `window.print()`). |
| `app/layout.tsx` | root | Root HTML layout — fonts, `LocaleProvider`, global styles. |
| `app/auth/callback/route.ts` | — | Supabase auth callback → redirects to `/app/home`. |

**Note: there is no `src/middleware.ts`.** The old one only guarded deleted legacy routes.
API routes are auth-gated individually; a hard login gate for `/app/*` pages is a flagged
pre-launch task.

### API routes — `src/app/api/`
| File | What it does |
|---|---|
| `transcripts/route.ts` | **Submit** (POST) — inserts row + fires the pipeline. The only place the pipeline runs. |
| `transcripts/[id]/route.ts` | GET (poll), PUT (edit), DELETE (admin), PATCH (admin rename). |
| `transcripts/[id]/speakers/route.ts` | Update speaker labels. |
| `transcripts/[id]/diarization/route.ts` | Additive speaker-edit overlay (re-segments speakers). |
| `chat/route.ts` | Chat — streams Gemini SSE → token stream (GPT-4.1 fallback). |
| `companies/route.ts`, `companies/[id]/route.ts` | List/search companies; single company. |
| `calls/route.ts`, `calls/follow/route.ts` | Scheduled calls; follow/unfollow (My Calendar). |
| `conversations/route.ts`, `conversations/[id]/route.ts` | Chat history. |
| `quotes/route.ts`, `quotes/[id]/route.ts` | Save/list, update/delete quotes. |
| `quote-folders/route.ts`, `quote-folders/[id]/route.ts` | My-Quotes folders. |
| `live/state/route.ts` | Non-auth poll: is a call live right now? (drives auto-detect). |
| `live/finish/route.ts` | Triggers/polls the live→finished hand-off. |
| `live/finished-call/[id]/route.ts` | Fetch the finished transcript produced from a live call. |
| `live/pcm/route.ts` | Live audio (PCM) stream proxy. |
| `auth/signout/route.ts` | Sign out (plain link target — do not turn into a dropdown). |
| `access-request/route.ts`, `admin/requests/route.ts` | Request access + admin review. |

---

## 4. Components — `src/components/`

### App shell & home — `components/app/`
| File | What it does |
|---|---|
| `MacWindowFrame.tsx` | The macOS-style window chrome wrapping the whole app. |
| `NavRail.tsx` | The icon nav rail (left edge of the three-layer sidebar). |
| `ShellChrome.tsx` | Content area + floating global bars (recorded player, live bar) + "return" chips. |
| `AppPage.tsx` | Standard page wrapper (expanded panel + main content). |
| `CollapsiblePanel.tsx` | The middle "expanded panel" column primitive. |
| `Greeting.tsx`, `TodayLine.tsx` | Home greeting + today's-date line. |
| `HomeSearch.tsx` | Company search box on Home. |
| `UpcomingCard.tsx` | A single upcoming-call card. |
| `LiveNowPanel.tsx` | "Live Now" panel (auto-detects an active call). |
| `GlobalPlayer.tsx` | The floating recorded-audio pill. |
| `GlobalLiveBar.tsx` | The floating LIVE audio bar (hear the call across pages). |
| `ReturnToTranscriptChip.tsx`, `ReturnToLiveChip.tsx` | Chips that re-dock you to the player/live page. |

### Live experience — `components/live/`
| File | What it does |
|---|---|
| `LiveSession.tsx` | Top-level live container — picks live vs finished mode via `/api/live/state`; runs the finish/auto-swap. |
| `LiveBroadcastView.tsx` | The live broadcast view (consumes the global live engine from `LiveAudioProvider`). |
| `LiveTranscriptView.tsx` | Renders a finished transcript (karaoke replay + toolbar). |
| `MediaPlayer.tsx` | Our audio player (play/seek/scrub). |
| `TranscriptBody.tsx` | The scrolling karaoke transcript body. |
| `TranscriptSidePanel.tsx` | Side panel (speakers/timeline), minimizable. |
| `TranscriptChatPanel.tsx` | In-transcript side chat ("Ask Atlas"). |
| `FacetPanes.tsx` | Facet-pane layout container (design-demo multi-column live view). |

### Chat — `components/chat/`
| File | What it does |
|---|---|
| `ChatView.tsx` | The main chat screen. |
| `ChatComposer.tsx` | The input box (+ reference box for "Ask Atlas"). |
| `ChatHistory.tsx` | History panel of past conversations. |
| `Markdown.tsx` | Markdown renderer (react-markdown + remark-gfm), content-driven RTL. |
| `MentionDropdown.tsx` | `/company` slash-command + @mention dropdown. |
| `CitationPopover.tsx` | Shows the source behind a cited answer. |
| `Typewriter.tsx`, `ThinkingDots.tsx` | Streaming-text animation + thinking indicator. |

### Company — `components/company/`
| File | What it does |
|---|---|
| `CompanyView.tsx` | The company page shell (Overview + Investor-Calls tabs). |
| `CompanyOverview.tsx` | Overview tab (latest call — incl. the just-ended in-flight call — upcoming, My Quotes). |
| `AddInvestorCall.tsx` | "Add Investor Call" (YouTube link → pipeline). |
| `MyQuotes.tsx`, `QuoteCard.tsx` | Saved quotes list + a single quote card. |
| `AdminCallControls.tsx` | Admin pencil/trash beside each finished call (rename/delete). |

### Other
| File | What it does |
|---|---|
| `calendar/CalendarView.tsx` | Month calendar (All calls vs My Calendar). |
| `ds/` | The design-system primitives: `Avatar` · `EntityRow` · `IconButton` · `Logo` · `BrandWordmark` · `LanguageToggle` · `SectionHeader` · `SelectableRow` · `Surface` · `Tabs` · `icons.tsx` · `AnimCanvas` · `LiveBeamAvatar` · `Monogram` · `index.ts`. |
| `workspace/WorkspacePicker.tsx` | Workspace selector panel (design-demo). |
| `auth/LoginForm.tsx`, `auth/JoinForm.tsx` | ⚠️ GATEWAY (Wave 2). |
| `ui/dotted-surface.tsx` | ⚠️ GATEWAY (Wave 2) — the only file left in `ui/`. |

---

## 5. Library code — `src/lib/`

### Auth & Supabase
| File | What it does |
|---|---|
| `supabase.ts` | Server Supabase clients: cookie-based `createServerSupabase` + service-role `supabaseAdmin`. |
| `supabase-browser.ts` | Browser Supabase client. |
| `auth.ts` | `getCurrentUser()` (name/admin flag) + `getRequestUserId()` (cookie OR Bearer token — the Bearer path lets trusted automation drive the API). |

### Data layer — the clean two-sided pattern
| Folder | What it does |
|---|---|
| `lib/db/` | **Server-only** direct Supabase queries (`import 'server-only'`, uses `supabaseAdmin`): `companies`, `calls`, `conversations`, `quotes`, `quoteFolders`, `transcripts`. Server components/route handlers call these. |
| `lib/api/` | **Client-side** fetch wrappers calling the API routes: `client.ts` (`apiGet/apiPost/apiPatch/apiDelete`) + per-domain modules. Client components call these. |
| `lib/transcripts.ts` | Shared transcript fetch/shape helpers. |

### Live engine — `lib/live/`
| File | What it does |
|---|---|
| `LiveAudioProvider.tsx` | App-shell context that OWNS the global live Web-Audio engine (state poll, PCM pump, buffer/drain math). |
| `liveTiming.ts` | Pure buffer-timing math (`delayedLiveEdge`, `hostedLiveOver`, `companyLiveDisplay`). Unit-tested. |
| `syncEngine.ts` | Karaoke sync — maps audio time → current word. Unit-tested. |
| `recallAdapter.ts` | Normalizes Recall.ai data into our shape. |
| `finishLiveCall.ts` | Live → finished hand-off (raw text → Gemini, words, PCM→MP3 → a normal transcript row). Unit-tested. |
| `loadCall.ts` | Loads a call (live or finished) for the viewer. |
| `search.ts` | In-transcript search. Unit-tested. |
| `ivritParse.ts` | Parses IVRIT/RunPod JSON chunk responses into our segment shape. |
| `ivritStitcher.ts` | Stitches overlapping IVRIT chunks into a clean transcript stream. Unit-tested. |
| `pcmChunker.ts` | Slices PCM audio into silence-aware chunks for IVRIT submission. Unit-tested. |
| `wavEncode.ts` | Encodes raw PCM to WAV (44-byte header + payload). Unit-tested. |
| `call-stubs.ts` | Design-demo live-call stubs (typed, to be replaced by real feed). Unit-tested. |

### Other lib
| File | What it does |
|---|---|
| `player/PlayerProvider.tsx` | Global **recorded**-audio player context (survives navigation + chat). |
| `chat/context.ts` | Builds the context block fed to Gemini for chat (context-stuffing, no vector DB). |
| `transcription.ts` | **The pipeline.** IVRIT/Whisper transcription + Gemini formatting (`formatTranscript`, `parseGeminiOutput`, `parseTitleMeta`) + GPT-4.1 fallback. |
| `correction.ts` | `KNOWN_CORRECTIONS` deterministic fixes. |
| `i18n/` | `config`, `LocaleProvider`, `server`, `format`, `dictionaries/{en,he,index}`. |
| `design/tokens.ts` | Design tokens in code. |
| `design/anim.ts` | Animation helpers (keyframe curves, spring config) for `AnimCanvas`. Unit-tested. |
| `workspace/data.ts` | Design-demo workspace feed (typed stub, to be replaced by real feed). Unit-tested. |
| `agents/data.ts` | Design-demo agents feed (typed stub, to be replaced by real feed). Unit-tested. |
| `company/overview-stub.ts` | Design-demo company extras (typed stub, to be replaced). Unit-tested. |
| `calendar/event-meta.ts` | Design-demo event metadata (typed stub, to be replaced). Unit-tested. |
| `types.ts` | The `Transcript` shape (= the shape of `formatted_data`). |
| `utils.ts` | Small helpers (`cn()` class merge, `isValidVideoUrl`). |
| `legacyBoundary.test.ts` | Build-enforced guard: Atlas roots may not import legacy folders (protects Wave 2). |
| `../data/demo/liveCall.ts` | The demo live call (built from the kept Recall fixture) — loaded by `loadCall.ts`. |

### Tests (run via `npm test` — 77 tests as of 2026-07-14)
`correction.test.ts` · `transcription.test.ts` · `legacyBoundary.test.ts` · `live/finishLiveCall.test.ts`
· `live/liveTiming.test.ts` · `live/syncEngine.test.ts` · `live/search.test.ts`
· `live/ivritStitcher.test.ts` · `live/pcmChunker.test.ts` · `live/wavEncode.test.ts`
· `live/call-stubs.test.ts` · `workspace/data.test.ts` · `agents/data.test.ts`
· `company/overview-stub.test.ts` · `calendar/event-meta.test.ts` · `design/anim.test.ts`
· `scripts/lib/measure-core.test.ts`.

---

## 6. Scripts — `scripts/` (triaged 2026-07-02: every file has a purpose)

- **Live engines** (both serve the same `:8788` `/state`+`/pcm` contract — run one at a time):
  `live-broadcast.mjs` (Recall engine — webhooks/websocket, Gemini correction, buffered broadcast),
  `live-ivrit-broadcast.ts` (IVRIT engine — audio-only Recall bot → IVRIT/RunPod chunks, run via `tsx`).
  Replay/test stand-ins: `live-replay-engine.mjs` (fake a live feed from a recorded session),
  `replay-audio-feeder.mjs` (stream an archived PCM into the IVRIT engine's websocket — no Zoom).
  Bot helpers: `start-ivrit-bot.mjs` (create the Recall audio-only bot then exit),
  `prep-replay-session.mjs` (prep a session for replay),
  `live-webinar-bots.mjs` (Zoom-webinar bot tooling — Mission 4).
  Hand-off: `finish-live-call.ts` + `verify-finish.ts` (run/verify the finish hand-off offline).
- **Pipeline tools:** `reformat.mjs` (re-run formatting only — cheap retry), `reprocess-audio.mjs`
  (backfill audio/word-timings on old rows), `transcribe-batch.mjs` + `review-urls.txt`
  (batch links through the product — drives `/transcript-review`).
- **Quality measurement:** `run-experiment.ts` + `measure.ts` + `lib/measure-core.ts` (+ its test) —
  diff a candidate transcript against the human gold (`fixtures/ampa-q1-2026.gold.txt`).
  `compare-live-quality.ts` (diff IVRIT-chunked vs Recall captions on same audio; vs whole-file IVRIT reference if present),
  `make-wholefile-reference.ts` (send the full session PCM to IVRIT as one call — isolates chunking cost),
  `spike-ivrit-live.ts` (latency spike: validates RunPod blob input + warm/cold round-trip time).
  `lib/runpod-live.ts` (shared RunPod client used by the quality and spike scripts).
- **Build/assets:** `install-yt-dlp.js` (runs in `npm run build`), `prep-brand-assets.mjs`
  (regenerates `public/brand/` from the logo — documented in `BrandWordmark`).
- **`fixtures/`:** the ampa gold set + `recall-spike.transcript.json` (load-bearing: demo call +
  syncEngine test). See `fixtures/README.md`.
- **`out/`:** runtime artifacts (git-ignored) — engine captures (`broadcast-*.{jsonl,pcm}`),
  rotated sessions.

---

## 7. Data, config & harness

### Database — `supabase/migrations/`
| Migration | Adds |
|---|---|
| `20260515_001…20260516_005` | [inert] watchlist / notification / alert tables from the old insider-feature era |
| `20260611_006_companies_scheduled_calls` | **`companies` + `scheduled_calls`** + `transcripts.company_id` |
| `20260613_007_quotes_followed_calls` | **`quotes`** + followed-calls |
| `20260613_008_transcripts_audio_word_segments` | `transcripts.audio_url` + `word_segments` |
| `20260613_009_speaker_names_quote_anchor_conversations` | speaker names + quote anchors + **`conversations`** |
| `20260614_010_quote_folders` | **`quote_folders`** + `quotes.folder_id` |
| `20260614_011_speaker_edits` | `transcripts.speaker_edits` (diarization overlay) |

`supabase/config.toml` = Supabase CLI config. **The DB is shared with the frozen old repo —
additive migrations only.**

### Root config
`package.json` · `tsconfig.json` · `next.config.js` · `tailwind.config.ts` · `postcss.config.js` ·
`nixpacks.toml` (Railway build) · `CLAUDE.md` · `PROGRESS.md` · `LEGACY.md` · this file.

### Static assets
`public/atlas-anim.js` (GSAP animation bootstrap, consumed by `AnimCanvas.tsx`) ·
`public/brand/` (logo variants — `atlas-wordmark.{png,svg}`, `atlas-A.svg`, `tase-mark.png` — generated by `prep-brand-assets.mjs`).

### Harness — `.claude/` (the smart environment, built 2026-07-02)
| File | What it does |
|---|---|
| `settings.json` | Permissions (safe pre-approvals + secret denies) + the two hook wirings. Tracked in git so every worktree gets the same harness. |
| `settings.local.json` | Machine-local permissions (git-ignored). |
| `hooks/pre-bash-gate.mjs` | PreToolUse gate: blocks destructive SQL, unsafe `rm -rf`, `.env` shell access, force-pushes, lane-pushes-to-main. Fire-tested (15-case matrix). |
| `hooks/post-edit-verify.mjs` | PostToolUse: auto-formats every edited `.ts/.tsx` + incremental typecheck; errors feed straight back to the session. |
| `rules/parallel-work.md` | Fleet law: ports, board protocol, engine ownership, shared-surface posts. |
| `rules/db.md` | Shared-with-production DB: additive-only migration law. |
| `rules/live.md` | Live-engine gotchas (restart-per-test, stale bundle, caption lag…). |
| `rules/app.md` | App-level gotchas: Hebrew PDF, sign-out anti-patterns, Railway redirects, transcript validation leniency. |
| `skills/verify-app/` | `/verify-app` — self-seeing verification loop (Chrome MCP screenshots) + per-lane recipes. |
| `skills/ship/` | `/ship` — the lane/supervisor shipping ritual (only the supervisor pushes main). |
| `skills/live-test/` | `/live-test` — run a real Recall+Zoom live test end-to-end. |
| `skills/transcript-review/` | `/transcript-review` — the transcript-quality gate. |
| `skills/fleet-lint/` | `/fleet-lint` — drift-check the whole environment (BOARD, rules, docs, open actions). |
| `agents/atlas-reviewer.md` | `atlas-reviewer` agent definition — the code/design review persona. |
| `hooks/gate-tests.mjs` | Extra gate: runs the test suite before commits. |

**Fleet memory (git-ignored, main checkout only):** `agent-memory/BOARD.md` (the shared brain —
all sessions read/write live via absolute path) + `state-<lane>.md` per session. Founder-provided
inputs: `design-import/` (Claude Design export), `local-assets/` (demo PDF). Fleet setup:
`docs/LAUNCH-KIT.md`.

### Docs — `docs/`
`docs/superpowers/{specs,plans}/` = the dated spec/plan for each feature built (history — keep).
`docs/V1-SECURITY-AND-LAUNCH-NOTES.md` = security/launch checklist.

---

## 8. Known gaps (flagged, deliberate — not mess)

The 2026-07 cleanup resolved the old "two products in one tree" clutter. What remains is a short,
honest list:

1. **No login gate on `/app/*` pages** — API routes are auth-gated, pages aren't. Needs a dedicated
   auth pass before launch (tracked in `CLAUDE.md`).
2. **Wave 2 gateway** — 4 legacy-styled files serve login until Atlas has its own (see `LEGACY.md`).
3. **`LiveAudioProvider` re-render pattern** — 10fps values in context; port `PlayerProvider`'s
   `useSyncExternalStore` pattern before adding more consumers (reviewer flag, 2026-06-27).
4. **Finish-trigger lives on the live page** — if the user navigates away at the exact moment a call
   ends, the finish fires only when they return. Handle before report-season concurrency.
5. **Inert legacy DB tables** (watchlist/alerts/etc. + a few foreign tables in shared Supabase) —
   harmless; clean up at deployment time, coordinated with the old repo's retirement.
