# ARCHITECTURE.md — Atlas (V1) codebase map

> **What this is:** a plain-language tour of the code we actually work in (the **V1 / Atlas**
> product under `/app/*`), file by file. Read it to understand *where things live* and *what each
> piece does*. For the *why* behind big decisions, see `CLAUDE.md` (project rules) and `PROGRESS.md`
> (decision log). This doc is a living map — when we change structure, we update it here.
>
> Scope: **V1 app, file-by-file.** The older root product (landing / dashboard / standalone
> transcript editor) is mapped too, but marked **[legacy]** so you can tell the two apart.

---

## 1. The big picture — two products in one repo

There are **two front-ends living in the same `src/` tree**, sharing one database and one pipeline:

1. **[legacy] The original תמלול product** — the public landing page + a simple dashboard where you
   paste a YouTube link and get a transcript. Routes: `/`, `/dashboard`, `/companies`,
   `/processing/[id]`, `/transcript/[id]`.
2. **Atlas (V1)** — the real product we're building, under **`/app/*`**. Three-layer RTL sidebar,
   Home / Calendar / Chat / Company / Live pages. Login lands you at `/app/home`.

Both share the same backend: the **API routes** (`src/app/api/*`), the **database layer**
(`src/lib/db/*`), the **transcription pipeline** (`src/lib/transcription.ts`), and the **Supabase**
tables. So when we say "the codebase feels messy," ~80% of that feeling is **these two products
coexisting** — not bad code. The core layers are clean and well-separated (see §8).

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth + Storage) · Tailwind ·
deployed on Railway → `timlul-ai.com`. Transcription: IVRIT (RunPod) → Gemini 3.5 Flash. Chat:
Gemini 3.5 Flash (GPT-4.1 fallback).

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
GET /api/transcripts/[id]      ← frontend polls every ~3s for progress
View: /app/company/[id]  or  [legacy] /transcript/[id]
```

### B. Live call (the crown jewel)
```
Recall.ai bot joins Zoom → live engine (scripts/live-broadcast.mjs)
  → raw captions + audio, corrected by Gemini, buffered ~5 min
Browser: /app/live/[id]  → LiveTranscriptView (karaoke captions synced to audio)
  → source ends → buffer drains → auto-swaps to the organized finished transcript
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

### V1 pages (under `/app/*`)
| File | Route | What it does |
|---|---|---|
| `app/app/layout.tsx` | `/app/*` | **The persistent shell.** Wraps every V1 page in the Mac window frame + nav rail + the two global audio providers (recorded + live) so audio survives navigation. |
| `app/app/page.tsx` | `/app` | Entry point for the app section (routes you into the shell). |
| `app/app/home/page.tsx` | `/app/home` | **Home** — greeting, company search, "Live Now", upcoming calls. |
| `app/app/calendar/page.tsx` | `/app/calendar` | **Calendar** — month view of all upcoming calls. |
| `app/app/chat/page.tsx` | `/app/chat` | **Chat** — LLM chat over the transcript DB. |
| `app/app/company/[id]/page.tsx` | `/app/company/[id]` | **Company page** — header, Overview + Investor-Calls tabs, My Quotes. |
| `app/app/live/[id]/page.tsx` | `/app/live/[id]` | **Live transcript page** — karaoke transcript synced to audio. |
| `app/app/settings/page.tsx` | `/app/settings` | Profile & settings. |
| `app/home/page.tsx` | `/home` | Top-level `/home` (likely a redirect/entry into `/app/home` — *verify when we touch it*). |

### [legacy] root product pages
| File | Route | What it does |
|---|---|---|
| `app/page.tsx` | `/` | [legacy] Public landing page. |
| `app/dashboard/page.tsx` | `/dashboard` | [legacy] Paste-a-link dashboard. |
| `app/companies/page.tsx` | `/companies` | [legacy] Companies list. |
| `app/processing/[id]/page.tsx` | `/processing/[id]` | [legacy] "Your transcript is processing" screen. |
| `app/transcript/[id]/page.tsx` | `/transcript/[id]` | [legacy] Standalone transcript view/edit (renders `TranscriptEditor`). |
| `app/print/[id]/page.tsx` + `PrintTrigger.tsx` | `/print/[id]` | Print-friendly transcript page (Hebrew PDF stopgap via `window.print()`). |
| `app/layout.tsx` | root | Root HTML layout — fonts, `LocaleProvider`, global styles. |
| `app/auth/callback/route.ts` | — | Supabase auth redirect callback. |

### API routes — `src/app/api/`
| File | What it does |
|---|---|
| `transcripts/route.ts` | **Submit** a transcript (POST) — inserts row + fires the pipeline. The only place the pipeline runs. |
| `transcripts/[id]/route.ts` | GET (poll status), PUT (edit), DELETE (admin), PATCH (admin rename). |
| `transcripts/[id]/speakers/route.ts` | Update speaker labels. |
| `transcripts/[id]/diarization/route.ts` | Save additive speaker-edit overlay (re-segments speakers). |
| `chat/route.ts` | Chat endpoint — proxies Gemini streaming SSE → token stream (GPT-4.1 fallback). |
| `companies/route.ts`, `companies/[id]/route.ts` | List/search companies; single company. |
| `calls/route.ts`, `calls/follow/route.ts` | Scheduled calls; follow/unfollow a call (My Calendar). |
| `conversations/route.ts`, `conversations/[id]/route.ts` | Chat history (list/create; load/delete a conversation). |
| `quotes/route.ts`, `quotes/[id]/route.ts` | Save/list quotes; update/delete a quote. |
| `quote-folders/route.ts`, `quote-folders/[id]/route.ts` | My-Quotes folders. |
| `live/state/route.ts` | Non-auth poll: is a call live right now? (drives auto-detect). |
| `live/finish/route.ts` | Triggers/polls the live→finished hand-off. |
| `live/finished-call/[id]/route.ts` | Fetch the finished transcript produced from a live call. |
| `live/pcm/route.ts` | Live audio (PCM) stream proxy. |
| `auth/signout/route.ts` | Sign out (plain link target — do not turn into a dropdown). |
| `access-request/route.ts`, `admin/requests/route.ts` | Request access (public) + admin review of requests. |

---

## 4. Components — `src/components/`

### V1 shell & home — `components/app/`
| File | What it does |
|---|---|
| `MacWindowFrame.tsx` | The macOS-style window chrome that wraps the whole app. |
| `NavRail.tsx` | The icon nav rail (left edge of the three-layer sidebar). |
| `ShellChrome.tsx` | Content area + the floating global bars (recorded player, live bar) + "return" chips. |
| `AppPage.tsx` | Standard page wrapper (expanded panel + main content). |
| `CollapsiblePanel.tsx` | The middle "expanded panel" column primitive. |
| `Greeting.tsx`, `TodayLine.tsx` | Home greeting + today's-date line. |
| `HomeSearch.tsx` | Company search box on Home. |
| `UpcomingCard.tsx` | A single upcoming-call card. |
| `LiveNowPanel.tsx` | "Live Now" panel (auto-detects an active call). |
| `GlobalPlayer.tsx` | The floating recorded-audio pill (Feature 4). |
| `GlobalLiveBar.tsx` | The floating LIVE audio bar (hear the call across pages). |
| `ReturnToTranscriptChip.tsx`, `ReturnToLiveChip.tsx` | "Return to…" chips that re-dock you to the player/live page. |

### Live experience — `components/live/`
| File | What it does |
|---|---|
| `LiveSession.tsx` | Top-level live container — picks live vs finished mode via `/api/live/state`. |
| `LiveBroadcastView.tsx` | The live broadcast view (consumes the global live engine). |
| `LiveTranscriptView.tsx` | Renders a transcript (live karaoke **and** finished replay use this one view). |
| `MediaPlayer.tsx` | Our audio player (play/seek/scrub) — keep this; it's ours. |
| `TranscriptBody.tsx` | The scrolling karaoke transcript body (V1). |
| `TranscriptSidePanel.tsx` | Side panel (speakers / sections), minimizable. |
| `TranscriptChatPanel.tsx` | In-transcript side chat ("Ask Atlas"). |

### Chat — `components/chat/`
| File | What it does |
|---|---|
| `ChatView.tsx` | The main chat screen. |
| `ChatComposer.tsx` | The input box (+ reference box for "Ask Atlas"). |
| `ChatHistory.tsx` | History panel of past conversations. |
| `Markdown.tsx` | Markdown renderer (react-markdown + remark-gfm), content-driven RTL. |
| `MentionDropdown.tsx` | `/company` slash-command + @mention dropdown. |
| `CitationPopover.tsx` | Shows the source behind a cited answer. |
| `Typewriter.tsx`, `ThinkingDots.tsx` | Streaming-text animation + "thinking" indicator. |

### Company — `components/company/`
| File | What it does |
|---|---|
| `CompanyView.tsx` | The company page shell (Overview + Investor-Calls tabs). |
| `CompanyOverview.tsx` | Overview tab (latest call, upcoming, My Quotes). |
| `AddInvestorCall.tsx` | "Add Investor Call" (YouTube link → pipeline). |
| `MyQuotes.tsx`, `QuoteCard.tsx` | Saved quotes list + a single quote card. |
| `AdminCallControls.tsx` | Admin pencil/trash beside each finished call (rename/delete). |

### Other V1 views
| File | What it does |
|---|---|
| `companies/CompaniesView.tsx` | The companies list view. |
| `calendar/CalendarView.tsx` | Month calendar (All calls vs My Calendar). |
| `platform/AdminView.tsx` | Admin dashboard view. |

### Design system — `components/ds/`
The newer, intentional UI primitives (the "DS" being synced to Claude Design):
`Avatar` · `EntityRow` · `IconButton` · `Logo` · `BrandWordmark` · `SectionHeader` · `SelectableRow` ·
`Surface` · `Tabs` · `icons.tsx` · `index.ts` (barrel export).

### [legacy / shared] older components
| Folder | What it does |
|---|---|
| `components/ui/` | Older shared primitives: `Button`, `Card`, `Input`, `Badge`, `LanguageToggle`, `dotted-surface`. Pre-date `ds/` — overlap to clean up later. |
| `components/transcript/` | [legacy] Standalone transcript editor stack: `TranscriptEditor`, `TranscriptHeader`, `TranscriptActions`, `SectionNav`, `TranscriptBody`. (Note: a **second** `TranscriptBody` from the V1 `live/` set exists — see §8.) |
| `components/dashboard/` | [legacy] `DashboardHome`, `TranscriptsTable`, `UrlInputBar`. |
| `components/landing/` | [legacy] `HeroSection`, `FeatureCards`, `TickerBar`, `TranscriptPreview`. |
| `components/layout/` | `DashboardSidebar`, `DashboardTopBar`, `AppNav`, `LandingNav` (mostly legacy layout). |
| `components/processing/ProcessingSteps.tsx` | [legacy] The processing-progress UI. |
| `components/auth/` | `LoginForm`, `JoinForm`. |
| `components/EmptyState.tsx`, `ErrorState.tsx` | Shared empty/error states. |

---

## 5. Library code — `src/lib/`

### Auth & Supabase
| File | What it does |
|---|---|
| `supabase.ts` | Server Supabase clients: cookie-based `createServerSupabase` + service-role `supabaseAdmin`. |
| `supabase-browser.ts` | Browser Supabase client. |
| `auth.ts` | `getCurrentUser()` and auth helpers. |
| `../middleware.ts` | Protects app routes (redirects unauthenticated users). |

### Data layer — the clean two-sided pattern
| Folder | What it does |
|---|---|
| `lib/db/` | **Server-only** direct Supabase queries (`import 'server-only'`, uses `supabaseAdmin`). Files: `companies`, `calls`, `conversations`, `quotes`, `quoteFolders`, `transcripts`. Server components/route handlers call these. |
| `lib/api/` | **Client-side** fetch wrappers that call the API routes. `client.ts` = `apiGet/apiPost/apiPatch/apiDelete`; plus `companies`, `calls`, `conversations`, `quotes`, `quoteFolders`, `chat`, `types`. Client components call these. |
| `lib/transcripts.ts` | Shared transcript fetch/shape helpers. |

### Live engine — `lib/live/`
| File | What it does |
|---|---|
| `recallAdapter.ts` | Normalizes Recall.ai realtime data into our shape. |
| `syncEngine.ts` | Karaoke sync — maps audio time → which word is "current". |
| `liveTiming.ts` | Pure buffer-timing math (`delayedLiveEdge`, `hostedLiveOver`). Unit-tested. |
| `finishLiveCall.ts` | Live → finished hand-off (raw text → Gemini, words, PCM→MP3 → a normal transcript row). |
| `loadCall.ts` | Loads a call (live or finished) for the viewer. |
| `search.ts` | In-transcript search. |
| `LiveAudioProvider.tsx` | React context holding the global live-audio engine (mounted in the shell). |

### Other lib
| File | What it does |
|---|---|
| `player/PlayerProvider.tsx` | Global **recorded**-audio player context (survives navigation + chat). |
| `chat/context.ts` | Builds the context block fed to Gemini for chat (V1 = context-stuffing, no vector DB). |
| `transcription.ts` | **The pipeline.** IVRIT/Whisper transcription + Gemini formatting (`formatTranscript`, `parseGeminiOutput`, `parseTitleMeta`). |
| `correction.ts` | `KNOWN_CORRECTIONS` deterministic fixes. |
| `i18n/` | Internationalization: `config`, `LocaleProvider`, `server`, `format`, `dictionaries/{en,he,index}`. |
| `design/tokens.ts` | Design tokens (colors/spacing) in code. |
| `types.ts` | The `Transcript` shape (= the shape of `formatted_data`). |
| `utils.ts` | Small helpers (e.g. `cn()` class merge). |

### Hooks & data
| File | What it does |
|---|---|
| `hooks/useProcessingTimer.ts` | Polls transcript status every ~3s while processing. |
| `data/demo/liveCall.ts` | Demo/sample live-call data for development. |

### Tests (run via `npm test`)
`correction.test.ts` · `transcription.test.ts` · `live/finishLiveCall.test.ts` · `live/liveTiming.test.ts`
· `live/syncEngine.test.ts` · `live/search.test.ts` · `scripts/lib/measure-core.test.ts`.

---

## 6. Scripts — `scripts/`

These are **command-line tools and spikes**, not part of the deployed app. Grouped by purpose:

- **Live engines / spikes:** `live-broadcast.mjs` (the real live engine + viewer), `live-replay-engine.mjs`
  (fake a live feed without Zoom), `live-replay.mjs`, `live-player.mjs`, `live-pipeline.mjs`,
  `live-bakeoff.mjs` (engine A/B harness), `live-listen.mjs`, `live-webinar-bots.mjs`, `recall-spike.mjs`,
  `prep-replay-session.mjs`, `finish-live-call.ts`, `verify-finish.ts`.
- **Pipeline / transcript tools:** `reformat.mjs` (re-run formatting only), `reprocess-audio.mjs` (backfill
  word timings), `transcribe-batch.mjs` (batch links through the product), `whisper-spike.mjs`,
  `llm-correct-spike.mjs`, `llm-polish-test.mjs`.
- **Quality measurement:** `measure.ts`, `run-experiment.ts`, `lib/measure-core.ts`, `test-merged.ts`,
  `claude-test.ts` — diff a candidate transcript against a human gold.
- **Build/assets:** `install-yt-dlp.js` (runs in `npm run build`), `prep-brand-assets.mjs`.

---

## 7. Data, config & harness

### Database — `supabase/migrations/`
| Migration | Adds |
|---|---|
| `20260515_001_watchlist` | [legacy] watchlist |
| `20260515_002_notification_prefs` | [legacy] notification prefs |
| `20260515_003 / 004_sent_alerts(_retry)` | [legacy] sent alerts |
| `20260516_005_seen_reports` | [legacy] seen reports |
| `20260611_006_companies_scheduled_calls` | **`companies` + `scheduled_calls`** (the V1 data layer) + `transcripts.company_id` |
| `20260613_007_quotes_followed_calls` | **`quotes`** + followed-calls |
| `20260613_008_transcripts_audio_word_segments` | `transcripts.audio_url` + `word_segments` |
| `20260613_009_speaker_names_quote_anchor_conversations` | speaker names + quote anchors + **`conversations`** (chat history) |
| `20260614_010_quote_folders` | **`quote_folders`** + `quotes.folder_id` |
| `20260614_011_speaker_edits` | `transcripts.speaker_edits` (diarization overlay) |

`supabase/config.toml` = Supabase CLI config.

### Root config files
`package.json` (deps + scripts) · `tsconfig.json` · `next.config.js` · `tailwind.config.ts` ·
`postcss.config.js` · `.env.example` (env var template) · `CLAUDE.md` (project rules) ·
`PROGRESS.md` (decision log) · this `ARCHITECTURE.md`.

### Harness — `.claude/`
| File | What it does |
|---|---|
| `settings.json` | Project Claude Code settings — currently only a few permission allows. **No hooks yet** (the two we want to add live here). |
| `settings.local.json` | Your machine-local permission allows (not shared). |
| `skills/live-test/SKILL.md` | The `/live-test` skill (run a real Recall+Zoom live test). |
| `skills/transcript-review/SKILL.md` | The `/transcript-review` quality-gate skill. |

### Docs — `docs/`
`docs/superpowers/plans/` + `docs/superpowers/specs/` = the historical plan/spec for each feature we built
(25+ files, newest = `2026-06-20-global-live-call`). `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` = security/launch checklist.

---

## 8. Where the "mess" actually is (and where it isn't)

> **Update 2026-06-29 — legacy↔Atlas boundary is now labeled + build-enforced.** Every legacy file
> carries a `⚠️ LEGACY`/`⚠️ GATEWAY` banner; a guard test (`src/lib/legacyBoundary.test.ts`) fails the
> build if Atlas ever imports a legacy folder; **`LEGACY.md`** is the one-pass deletion manifest.
> `LanguageToggle` moved `ui/ → ds/` (the last Atlas→legacy thread, now gone); 6 dead files removed.

**Clean and well-architected (leave alone):**
- The `lib/db` (server) vs `lib/api` (client) split — textbook layering.
- The `lib/live/*` engine — pure, unit-tested timing logic separated from UI.
- The pipeline (`transcription.ts`) — single entry point, well-documented.

**The real sources of clutter (candidates for deliberate cleanup):**
1. **Two products in one tree** — `[legacy]` landing/dashboard/companies/transcript routes + components
   sit next to V1. Biggest "mess" feeling. Decision needed: keep, archive, or delete legacy.
2. **Two UI primitive sets** — `components/ui/` (old) vs `components/ds/` (new design system). They overlap.
3. **Two `TranscriptBody.tsx`** — one in `components/transcript/` [legacy], one in `components/live/` (V1).
   Same name, different file → confusing. Worth renaming the legacy one.
4. **Untracked build dirs** — `.ds-sync/` and `ds-bundle/` sit in the working tree. The `.gitignore` fix
   that hides them lives on the `feat/atlas-ui-kit` branch (not yet merged).
5. **`scripts/` mixes** throwaway spikes with real tooling — could split into `scripts/spikes/`.

None of this is urgent or broken — it's the natural residue of moving fast from one product to the next.
We can clean it one deliberate step at a time.
