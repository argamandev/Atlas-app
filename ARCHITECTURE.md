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
Railway — **THIS repo is what deploys, and it is LIVE at `www.timlul-ai.com` since 2026-08-08**,
having replaced the old Timlul deploy rather than running beside it. (This line said "deploys from
the old repo for now; this clone develops on localhost" until 2026-08-10, i.e. it kept telling
sessions a mistake on main was local for two days after it stopped being. Found by a cold audit of
CLAUDE.md, which sells this file as "the codebase, file by file".) Transcription:
IVRIT (RunPod) → Gemini 3.5 Flash. Chat: Gemini 3.5 Flash (GPT-4.1 fallback) — note the workspace
leads with the OTHER vendor (`lib/workspace/askModel.ts`: gpt-4.1 primary, Gemini hedged).

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
/app/chat  → ChatView → POST /api/chat/v2      ← the ONLY chat route (08c-3)
  → ONE grounding per turn (src/lib/chat2/requestScope.ts): none | company | call
    | live | shelf — refused with a 400, never downgraded to market-wide search
  → plus two ORTHOGONAL modifiers that compose with all five:
      projectId  → the project's instructions into the system prompt's volatile tail
      documents  → a marked report passage + ≤4 snipped page images (below)
  → optional documentRef (a marked report passage) adds a fenced page block from
    document_pages (src/lib/chat2/documentInjection.ts + documentSource.ts)
  → optional attachments (Pinge snips: ≤4 PNG data URLs of report regions) become
    Anthropic IMAGE content blocks + Hebrew page captions on the user turn — the
    capability 08c-3 added, and the reason the old route outlived three slices
  → streams typed NDJSON ChatEvents back to the browser, markdown-rendered

/api/chat (Gemini 3.5 Flash, plain-text stream, x-chat-source header) is DELETED
  (08c-3). It died when its LAST caller left, not when its first one did:
  TranscriptChatPanel kept it alive for marked pages and snips after ChatView had
  moved. `lib/api/chat.ts`, `lib/chat/turnRoute.ts` and their tests went with it.
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
| `app/app/company/[id]/period/[period]/page.tsx` | `/app/company/[id]/period/[period]` | **A past period, in the live-call viewer** (2026-08-09) — report + presentation + transcript-if-any for one fiscal period, rendered by the SAME `LiveTranscriptView` a live call uses, so Ask Atlas, snipping and Single/Multi come for free. Synthesizes a call-shaped object when no transcript exists; that state is the common one (5 of 895 events have an attributed transcript) and is what `formatDate('')` used to 500 on. |
| `app/app/chat/projects/page.tsx` | `/app/chat/projects` | **Projects list** — the project surface inside the chat shell. UI only. |
| `app/app/chat/projects/[id]/page.tsx` | `/app/chat/projects/[id]` | **Project view** — files, context, composer. UI only. |
| `app/app/workspace/page.tsx` | `/app/workspace` | **Workspace picker** — the workspace selector. |
| `app/app/workspace/[id]/page.tsx` | `/app/workspace/[id]` | **Workspace shell** — tabs, working document, detail column. UI only. |
| `app/app/agents/page.tsx` | `/app/agents` | **Agents** — agent list, dock, create-agent. UI only. |
| `app/app/settings/page.tsx` | `/app/settings` | Profile & settings. |

> **⚠ THIS BLOCK SAID ALL FOUR SURFACES HAD NO BACKEND. TWO OF THEM NOW DO** — Projects since
> 2026-08-02, Workspace since 2026-08-08. Both persist, both write rows, and both query through
> the caller's own client with RLS load-bearing. **`/app/agents` is the one still UI-only**: it
> is demo-fed from `lib/demo/DemoStateProvider`, carries its `DemoBanner`, and every control
> that would need a backend renders disabled with a stated reason — agent execution needs the
> deploy. `docs/DATA-MODEL.md` holds the ownership rules any new table must satisfy.

### Gateway + shared
| File | Route | What it does |
|---|---|---|
| `app/page.tsx` | `/` | ⚠️ GATEWAY — login/landing (legacy-styled; Wave 2, see `LEGACY.md`). Login → `?next=` if the gate sent them, else `/app/home`. |
| `app/print/[id]/page.tsx` (+ `PrintTrigger.tsx`) | `/print/[id]` | Print-friendly transcript (Hebrew PDF stopgap via `window.print()`). |
| `app/layout.tsx` | root | Root HTML layout — fonts, `LocaleProvider`, global styles. |
| `app/auth/callback/route.ts` | — | Supabase auth callback → redirects to `/app/home`. |

**`src/middleware.ts` — THE LOGIN GATE** (added 2026-08-01). Redirects anonymous visitors away
from `/app/*` and `/print/*` to the login page at `/`, carrying `?next=<destination>`. Decision
logic is pure and unit-tested in `src/lib/auth/gate.ts` (`requiresAuth`, `resolveOrigin`,
`loginRedirectTarget`, `safeNextPath`); `config.matcher` must stay in sync with `GATED_PREFIXES`
— a test asserts it, because drift is a silent full bypass. Uses `getUser()` (revalidates the
token), never `getSession()`. Must NOT import `@/lib/supabase` — that instantiates the
service-role client at module scope. **Needs `NEXT_PUBLIC_SITE_HOST` = the public hostname once
deployed behind a proxy** — unset, anonymous users are redirected to the server's internal origin
and login is unreachable (`docs/V1-SECURITY-AND-LAUNCH-NOTES.md` item 1; not in `.env.example`
yet). **API routes are gated UNIFORMLY and a test enforces it** since 2026-08-03 —
`src/lib/apiAuthBoundary.test.ts` fails the battery for any handler that resolves no user, with a
7-entry `PUBLIC` allowlist (capped at 8) where each entry must state its reason. Two of those
seven — `/live/state` and `/live/pcm` — are marked OPEN, not "by design"; see the "Open,
deliberately" section of `.claude/rules/app.md`. *(This paragraph read "gated per-route and
inconsistently — read the 🔴 entry at the top of `.claude/rules/app.md`" until 2026-08-10. There
was no 🔴 entry, and the claim had been false since the boundary test landed a week earlier; it
was telling every fresh session not to trust a guarantee the repo actually had.)*

### API routes — `src/app/api/`
| File | What it does |
|---|---|
| `transcripts/route.ts` | **Submit** (POST) — births the row through the door (`db/transcripts.ts`: companyId REQUIRED, visible 400 without one; duplicate source → the existing row) + fires the pipeline, whose completion runs `finalizeTranscript` (aligned line times, revision, atomic re-chunk). Admin `force` re-processes the SAME row — sibling `_r` ids are banned (standard §1). |
| `transcripts/[id]/route.ts` | GET (poll), PUT (edit), DELETE (admin), PATCH (admin rename). PUT/PATCH save through `saveFormattedData` — every content edit re-aligns, bumps revision and re-chunks. |
| `transcripts/[id]/speakers/route.ts` | Update speaker labels. **Admin-only since 2026-08-13** — corpus curation (`docs/DATA-MODEL.md`), gated by `requireAdmin` + `curationAuthz.test.ts`. |
| `transcripts/[id]/diarization/route.ts` | Additive speaker-edit overlay (re-segments speakers). **Admin-only since 2026-08-13**, same gate. |
| `chat/route.ts` | Chat — streams Gemini SSE → token stream (GPT-4.1 fallback). **Still the one every client calls**; B2 retires it. |
| `chat/v2/route.ts` | **The smart-layer chat backend (slice B1a).** Sonnet 5 tool loop over the corpus. **NDJSON, not SSE** — `content-type: application/x-ndjson`, one JSON `ChatEvent` per line, no `data:` framing; build the ticket-07 client from that. Failures are framed OUT OF BAND as their own event types, never as text inside the answer stream. The stream ends in exactly ONE terminal event and `done` is the only one meaning complete — `incomplete` carries a reason (truncation, round-trip cap, unverifiable quote) and `error` means nothing usable came back. Every client-supplied id is refused unless uuid-shaped, because `companyId` reaches the system prompt. |
| `companies/route.ts`, `companies/[id]/route.ts` | List/search companies; single company. |
| `companies/[id]/filings/route.ts` | ONE fiscal year of a company's filing catalog, listed live from MAYA (nothing stored), behind a 5-minute per-company-year cache (`lib/maya/catalogCache.ts`). Bounds the year to 1990..2100. |
| `documents/open/route.ts` | Opening a filing STORES it — the ingestion path. **Never accepts a PDF url from the client**: it re-derives the url from MAYA by `mayaReportId` and refuses a filing that is not in that company's catalog. Runs with the service role, so read it adversarially before changing it. |
| `calls/route.ts`, `calls/follow/route.ts` | Scheduled calls; follow/unfollow (My Calendar). |
| `conversations/route.ts`, `conversations/[id]/route.ts` | Chat history. |
| `quotes/route.ts`, `quotes/[id]/route.ts` | Save/list, update/delete quotes. |
| `quote-folders/route.ts`, `quote-folders/[id]/route.ts` | My-Quotes folders. |
| `live/state/route.ts` | Non-auth poll: is a call live right now? (drives auto-detect). |
| `live/finish/route.ts` | Triggers/polls the live→finished hand-off. |
| `live/finished-call/[id]/route.ts` | Fetch the finished transcript produced from a live call. |
| `live/pcm/route.ts` | Live audio (PCM) stream proxy. |
| `documents/route.ts` | Auth-gated: which real documents exist for a company+quarter (Report pane asks). |
| `documents/[id]/file/route.ts` | Auth-gated PDF bytes from the private `company-documents` bucket (`private, no-store` — re-ingests must invalidate viewers). |
| `auth/signout/route.ts` | Sign out (plain link target — do not turn into a dropdown). |
| `access-request/route.ts`, `admin/requests/route.ts` | Request access + admin review. |
| `workspaces/route.ts`, `workspaces/[id]/route.ts` | List/create workspaces; get/patch/delete one. Every one queries through the **caller's own** client, so RLS is load-bearing (the `lib/db/projects.ts` pattern, not `supabaseAdmin`). |
| `workspaces/sources/route.ts` | The attachable corpus (transcripts + documents) for the intake panel. |
| `workspaces/[id]/items/route.ts`, `items/[itemId]/route.ts` | Add/list shelf items; patch layout / remove one. |
| `workspaces/[id]/items/[itemId]/content/route.ts` | An item's rendered content (pages / transcript lines) for the pane. |
| `workspaces/[id]/items/from-maya/route.ts` | Attach a MAYA filing Atlas does not hold yet: downloads the PDF, extracts it, ingests into the **shared corpus**, then shelves it. The only user-reachable writer of that corpus — see Known gaps. |
| `workspaces/[id]/intake/route.ts` | The conversational intake: interpret → select → agree → attach. **One exit** (`respond()` → `intakeResult`), which is what makes "`ready` with an empty selection" unrepresentable. |
| `workspaces/[id]/thread/route.ts`, `counts/route.ts` | Persisted intake conversation; shelf/thread counts for the picker. |
| `workspaces/[id]/chat/route.ts`, `compose/route.ts` | Workspace chat over the shelf; compose a document section from it. |
| `workspaces/[id]/blocks/route.ts`, `blocks/[blockId]/route.ts` | The working document's blocks + citations. |

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
| `TranscriptChatPanel.tsx` | In-transcript side chat ("Ask Atlas") — also owns the Pinge snip-chip stack (≤4 thumbnails, ✕-remove, cap toast). |
| `FacetPanes.tsx` | Facet-pane layout container (Single/Multi columns); Report pane loads the real company+quarter PDF via `/api/documents`, stub card fallback when none exists. |
| `PdfViewer.tsx` | pdf.js viewer (native import from `public/pdf.min.mjs`) — selectable Hebrew text layer, zoom/pan/page-nav; marked passage → Ask Atlas `documentRef`; Pinge scissors overlay (drag-rect → zoom-proof 2× offscreen crop via `lib/documents/snip.ts`). |

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
| `DocumentsTab.tsx` | **The documents catalog** (2026-08-09) — fiscal years listed down to a 2015 floor, a year fetched from MAYA only when opened, periods (Q1/Q2/Q3/Annual) inside it, and a click that opens the period in the transcript viewer. The year/period stay in the URL (`?tab=reports&year=&period=`) so back-navigation returns to the open drill-down. |

### Other
| File | What it does |
|---|---|
| `calendar/CalendarView.tsx` | Month calendar (All calls vs My Calendar). |
| `ds/` | The design-system primitives: `Avatar` · `EntityRow` · `IconButton` · `Logo` · `BrandWordmark` · `LanguageToggle` · `SectionHeader` · `SelectableRow` · `Surface` · `Tabs` · `icons.tsx` · `AnimCanvas` · `LiveBeamAvatar` · `Monogram` · `DemoBanner` · `PillComposer` · `index.ts`. |
| `auth/LoginForm.tsx`, `auth/JoinForm.tsx` | ⚠️ GATEWAY (Wave 2). |
| `ui/dotted-surface.tsx` | ⚠️ GATEWAY (Wave 2) — the only file left in `ui/`. |

### The three surfaces — `components/workspace/`, `components/projects/`, `components/agents/`
Imported 2026-08-01 (`feat/surfaces-import`) as frontend only. **Two of the three now have real
backends: Projects since 2026-08-02, Workspace since 2026-08-08 (`feat/workspace-tables`).**
`components/agents/` is still demo-fed and still carries its `DemoBanner` — agent execution needs
the deploy, which comes after this chapter.

| File | What it does |
|---|---|
| `workspace/WorkspacePicker.tsx` | Workspace selector panel — search + sort. |
| `workspace/WorkspaceRoute.tsx` | Routes an id to the shell, or to intake when the workspace is empty. |
| `workspace/WorkspaceShell.tsx` | The workspace frame — tab bar, panes, detail column. |
| `workspace/WorkspaceIntake.tsx` | "What are we working on today?" — the new-workspace screen. |
| `workspace/WorkingDocument.tsx` | The deliverable. `contentEditable` + `execCommand` (deliberately no editor library). Blocks + citations now PERSIST via `/blocks`. Export is still disabled and says so on screen. |
| `workspace/WorkspaceDocs.tsx` | The document/file pane. |
| `workspace/WorkspaceDetailColumn.tsx` | Right-hand detail column (threads, agents, sessions). |
| `workspace/WorkspaceChat.tsx` | Chat over the shelf — the workspace's own conversation, distinct from global chat. |
| `workspace/SourceDocument.tsx` | Renders a shelved source (PDF pages / transcript lines) inside a pane. |
| `workspace/ConfirmDialog.tsx` | The destructive-action confirm (delete workspace, remove source). Its `<bdi>` handling is the reference example for mixed Hebrew/Latin lines — 32 combinations measured, 6 differ. |
| ~~`workspace/LegalDueDiligence.tsx`~~ | **Deleted 2026-08-08** with the rest of the workspace demo content. |
| `projects/ProjectsList.tsx`, `projects/ProjectView.tsx` | Project list + detail (files, context, composer). Backed by the real API since 2026-08-02 — no longer demo state. |
| `projects/ProjectChat.tsx` | Mounts `ChatView` with `projectId` set and hands it `renderMain`, so a project's composer drives the ONE chat engine (streaming, persistence, citations) instead of a second implementation. `renderMain` also receives `open(id)`, which is the only route back into a project's past conversations — they are deliberately excluded from global Recent Chats. |
| `agents/AgentsPage.tsx`, `agents/AgentDock.tsx`, `agents/CommandDeck.tsx`, `agents/CreateAgent.tsx` | The agents surface: list, dock, deck, and the create-agent flow. |

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
| `lib/db/` | **Server-only** direct Supabase queries (`import 'server-only'`): `companies`, `calls`, `conversations`, `quotes`, `quoteFolders`, `transcripts` use `supabaseAdmin`, which **bypasses RLS** — those modules are responsible for their own ownership filtering. **`projects.ts` deliberately does not**: it takes the caller's user client so RLS is load-bearing rather than decorative, and the file carries comments at each site saying why. Copy `projects.ts`, not its neighbours. |
| `lib/api/` | **Client-side** fetch wrappers calling the API routes: `client.ts` (`apiGet/apiPost/apiPatch/apiDelete`) + per-domain modules. Client components call these. |
| `lib/projects/` | The projects domain, split so each half is testable alone: `client.ts` (browser fetch wrappers), `validate.ts` (input rules), `derive.ts` (capacity/count maths shown in the UI), `present.ts` (row → view model). |
| `lib/chat/projectContext.ts` | Builds the project's instructions + memory + context sources into the system block injected server-side on every message sent inside a project, and reports whether it had to truncate. |
| `lib/auth/verifyUser.ts` | The verifying user lookup (`getUser()`, which revalidates the token) that replaced every `auth.getSession()` call site on 2026-08-02. Unit-tested. |
| `lib/auth.ts` | `getRequestUserId(req)` — resolves the caller from the session cookie OR an `Authorization: Bearer` token (the bearer path is how trusted automation drives the same API) — plus `getCurrentUser()`, `unauthorized()` (the single 401 every route returns), and `requireAdmin(req)` — the curation gate (401/403/null) for routes that write what every user sees; `curationAuthz.test.ts` pins which routes must use it. The route pattern is two lines: resolve, then `if (!userId) return unauthorized()`; `apiAuthBoundary.test.ts` enforces it. |
| `lib/transcripts.ts` | Shared transcript fetch/shape helpers. |
| `db/transcripts.ts` | **THE transcript birth door (standard §1–§2)** — every `transcripts` insert/upsert and every `formatted_data`/`word_segments` regeneration lives here, guarded by `transcriptBirthDoor.test.ts` in the battery: `birthTranscript` (companyId + sourceKey REQUIRED; duplicate → existing row), `birthLiveStub`, `stageTranscriptContent`, `finalizeTranscript`/`saveFormattedData`/`saveWordSegments` (align + revision + atomic re-chunk in one operation). Import-safe top, injectable db — unit-tested offline. |

### Live engine — `lib/live/`
| File | What it does |
|---|---|
| `LiveAudioProvider.tsx` | App-shell context that OWNS the global live Web-Audio engine (state poll, PCM pump, buffer/drain math). |
| `liveTiming.ts` | Pure buffer-timing math (`delayedLiveEdge`, `hostedLiveOver`, `companyLiveDisplay`). Unit-tested. |
| `syncEngine.ts` | Karaoke sync — maps audio time → current word. Unit-tested. |
| `recallAdapter.ts` | Normalizes Recall.ai data into our shape. |
| `finishLiveCall.ts` | Live → finished hand-off (raw text → Gemini, words, PCM→MP3 → a normal transcript row). Unit-tested. |
| `loadCall.ts` | Loads a call (live or finished) for the viewer. `LiveCall.storedTranscriptId` is the fact every "is there a transcript here" decision reads — `id` is a routing key and two producers key on something that is not a transcript. |
| `askGrounding.ts` | What Ask Atlas is grounded in on a transcript-shaped screen — the call, else the company, else market-wide. Pure; swept in `askGrounding.test.ts`. |
| `search.ts` | In-transcript search. Unit-tested. |
| `ivritParse.ts` | Parses IVRIT/RunPod JSON chunk responses into our segment shape. |
| `ivritStitcher.ts` | Stitches overlapping IVRIT chunks into a clean transcript stream. Unit-tested. |
| `pcmChunker.ts` | Slices PCM audio into silence-aware chunks for IVRIT submission. Unit-tested. |
| `wavEncode.ts` | Encodes raw PCM to WAV (44-byte header + payload). Unit-tested. |
| `snipBridge.ts` | Tiny global store letting the Ask Atlas composer arm the Report-pane snip crop (`atlas:arm-snip` event + `snippable` state) — the two snip entry points share one path. Unit-tested. |

### Other lib
| File | What it does |
|---|---|
| `player/PlayerProvider.tsx` | Global **recorded**-audio player context (survives navigation + chat) — incl. `usePlayerTimeDerived()` (subscribe to derived word/second, not the raw 60fps playhead) and `barHidden`. |
| `chat/attachments.ts` | Pinge attachment contract, pure: `parseAttachments` (PNG-only, ≤4, ~1.5MB decoded cap), `attachmentOversized` client pre-check (same constant — no drift), Hebrew captions, Gemini/OpenAI message-part builders. Unit-tested. |
| `chat/captionPayload.ts` | The one function that survived `turnRoute.ts` (08c-3): the CLIENT-side ceiling on how many live captions a turn puts on the wire, keeping the END so the two cuts cannot disagree, and staying ABOVE the injection budget so the server still reports `truncated`. Unit-tested. |
| `chat/history.ts` | Pure `sanitizeHistory` — drops empty/junk history turns (empty Gemini `{text:''}` parts reject the whole request), prefers `apiContent` over display content. Run client-side by the chat panel. The v2 route filters history inline and does NOT call it — a gap, not a design (08c-3). Unit-tested. |
| `documents/` | Multiview M1 backend: `extract.ts` (Hebrew-safe per-page PDF text — y-group → RTL desc-x with LTR runs; unit-tested quirk cases), `ingest.ts` (idempotent upload+extract+seed), `index.ts` (server-only reads: `getDocumentsFor`, `getDocumentMeta`, `getPageText`), `snip.ts` (pure Pinge crop geometry: drag→page-rect clamp + zoom-proof render-scale math; unit-tested). |
| `transcription.ts` | **The pipeline.** IVRIT/Whisper transcription + Gemini formatting (`formatTranscript`, `parseGeminiOutput`, `parseTitleMeta`) + GPT-4.1 fallback. |
| `correction.ts` | `KNOWN_CORRECTIONS` deterministic fixes. |
| `i18n/` | `config`, `LocaleProvider`, `server`, `format`, `dictionaries/{en,he,index}`. |
| `design/tokens.ts` | Design tokens in code — ONE light theme ("Harvey", 2026-08-01); the theme cycle and the dark-call token family are gone. `railText` `#85817A` is a DELIBERATE deviation from the design import (WCAG AA 5.109:1 vs the design's ~3.6:1) — do not let a parity probe revert it. |
| `design/anim.ts` | Animation helpers (keyframe curves, spring config) for `AnimCanvas`. Unit-tested. |
| `workspace/` | **Workspace V1 (2026-08-08) — the real thing, ~19 modules.** Pure rules that need no database: `validate` (every write shape), `present`/`derive`, `blocks`, `panes` (the pane cap), `thread`, `clip`, `tabLabel`. `data.ts` is now the ATTACHABLE-SOURCE feed, not a demo stub — the only demo constants left feed `/app/agents`, and `data.test.ts` fails if anything re-exports them. |
| `workspace/intake/` | **The conversational intake, 16 modules** — `companyPin` (which company this turn is about: an `@`-picked ROW outranks any reading of the sentence, and a picked company with no MAYA issuer id is named as unreachable rather than searched) → `parseRequest` → `findSources` → `selectSources` (the model picks from a list it was given; it can never invent a file) → `agreement` (bare-yes recognised in CODE, not asked of a model) → `respond` (`intakeResult`: `ready` + empty selection is downgraded to an honest question) → `notice` (WHICH single caveat the panel shows; the order between the five IS the meaning, and the component keeps only the wording). Three review rounds live in `agreement.ts`'s header comments — read them before changing a word list. |
| `workspace/chat/` | Workspace chat: `context`, `compose`, `prompt`, `plan`. |
| `maya/` | **The MAYA platform layer (2026-08-06), 20 modules — knows nothing about workspaces** (four future consumers). `client` (typed `MayaResult`, never throws into a route; every request awaits the GLOBAL `limiter` — 10 req/2s is ONE budget for the whole key, standard §7), `disclosures`, `filings` (now carries `xbrlUrl` + `publishedISO` through), `issuers` (`resolveIssuer`), `dates`/`events`/`layering`, `files`, `xbrl` (ת930 parser + `downloadXbrl` XML-magic guard + `persistFilingFacts`), `ingestFiling` (facts + `publication_date` + visible `facts_status` at the filing birth door). **Slice A5 adds three:** `latestOfEach` (the founder-approved backfill depth as a pure function — latest quarterly + latest annual + 12 months of decks, `now` passed in so a dry run and the real run cannot disagree), `syncFilings` (the ONE door the backfill, the poller and the nightly sweep all reconcile through — what is held, what to spend, the 23505 race, and the (period, type) collision resolved BEFORE any download), and `disclosures.latestDisclosures` (the live market feed — MAYA product 1.0.0, which spells attachments `attachedfiles` where v2 spells them `attachedFiles`, so it is NORMALISED at the door or every row silently loses its PDF). |
| `corpus/` | **The ingestion birth machinery (slice A3, `docs/INGESTION-STANDARD.md`).** `chunker.ts` — THE one chunker (the eval harness imports it; line-windows 700/1,100 on speaker seams, page-as-chunk >3,500 split ~2,200; verbatim `content` separate from prefixed `embeddingInput`). `align.ts` — per-line timestamp alignment (proportional map + exact-word refinement), run once at finalize and PERSISTED; untimed lines keep the visible `00:00:00` sentinel. `embed.ts` — gemini-embedding-001 @1536 MRL re-normalized, injectable fetch. `reindex.ts` — atomic chunk swap per source via `atlas_replace_chunks` (028) with embedding carry-forward, visible `index_status` transitions, demo rows `excluded`. All unit-tested. `retrieve.ts` — the one READ door, dense-only by default (founder 2026-08-14), calling `atlas_search_chunks_v2` (031); its `ChannelReport` reports `saw` against a scope count capped at pool+1, so `truncated` means CUT SHORT rather than "filled the pool". `indexHealth.ts` — the pure arithmetic behind `/app/admin/corpus`: an unrecognised `index_status` counts as `other` and un-settles the corpus rather than being folded into a familiar bucket. |
| `chat/grounding.ts` | **What a chat answer is grounded in** — `ChatSnip`, `ChatSource`, `DocumentRef`. Domain vocabulary with no transport, imported by 15 modules (`git grep -l "chat/grounding" -- src \| grep -v grounding.ts \| wc -l` — live views, PDF viewer, workspace shelf, citations, and `lib/api/chat2.ts`). Moved out of `lib/api/chat.ts` in 08a so retiring that route's wire format would not drag them — which is exactly what happened at 08c-3, when that file was deleted and these types did not move; `chat/domainBoundary.test.ts` fails if anything under `src/lib/chat` imports `lib/api`. |
| `chat/messageState.ts` | Is a STORED message whole, and did its context reach the model — `sanitizeContextStatus`, `sanitizeTruncated`, `truncatedForPersist` (+ `ProjectContextStatus`). Honesty machinery that outlives any wire format: `truncatedForPersist` reads v2's `incomplete` as a third source, because a v2 turn that hit its length limit has no `errorKind` at all. Tested by `chat/contextStatus.test.ts` + `chat/messageFlags.test.ts`. |
| `chat2/protocol.ts` | **THE `/api/chat/v2` wire vocabulary, declared once for both sides (08a).** The incomplete codes are a `const` array and `IncompleteCode` is DERIVED from it, so the two cannot drift — before this the type lived in `terminal.ts` and a hand-maintained runtime array in `api/chat2.ts` was what the parser actually consulted, so a ninth code would have been silently rewritten to `stopped_unknown` with everything green. Also owns both event unions (`ChatEvent` server-side, `ClientChatEvent` widened only by `stream_ended`), `TERMINAL_EVENTS`, `isTerminal`, `parseChatEvent` and `STREAM_ENDED`. Client-importable: its only import is the pure `mode.ts`. |
| `chat2/` | **The smart-layer chat engine (slice B1a, spec §3), 17 modules** (`ls src/lib/chat2/*.ts \| grep -v test \| wc -l`; `protocol.ts` and `mode.ts` are the two with their own rows — the count read 8 until 08a, having missed `mode.ts` since ticket 07, 10 until 08b added the two call-injection modules, 12 until 08c-1 added the two project ones, and 14 until 08c-2 added `liveInjection.ts`, and 15 until 08c-3 added the two document ones). `requestScope.ts` — spec §2.3's grounding recipes as ONE `Grounding` union (`none`/`company`/`call`/`live`/`shelf`) plus the gate that parses it out of an untrusted body, at the one point scope is built, because `companyId` reaches the system prompt. **A PROJECT IS NOT A FIFTH RECIPE** (08c-1): the union answers where an answer comes FROM, a project answers whose standing instructions it runs UNDER, and the two COMPOSE — a user inside a project can `@mention` a company and gets both — so `projectId` rides beside the union on `TurnScope`, and `scopeIdsFor` takes that. A fifth variant would have made the shipped pair unrepresentable and stopped the mention scoping under a chip still promising it. `projectInjection.ts`/`projectSource.ts` (08c-1) — the project's own written layer (instructions, memory, typed notes) built by the ONE budgeted function `lib/chat/projectContext.ts` shares with the old route and the UI's capacity meter, injected into the system prompt's VOLATILE tail so it never disturbs the cache-stable prefix, and read through the CALLER'S supabase client so RLS decides ownership. Unlike a call, a project that will not load does NOT end the turn: it reports `projectContext: 'failed'` to the surface AND tells the model, because a project is a modifier rather than the answer's source. It REFUSES rather than downgrades: a malformed grounding is a 400, never a quiet fall back to market-wide search under a chip promising a call. Two gates, not one — `asUuid` for the uuid columns, `asTranscriptId` for `transcripts.id`, which is `text` (YouTube ids and slugs), a fact that sat wrong in this file's own prose for a whole ticket because nothing read the field. **A LIVE CALL IS A FIFTH RECIPE, and it is one for the reason a project is not** (08c-2): it answers exactly the union's own question — where the answer comes from — and the answer is the call the user is watching. It is the ONLY recipe carrying CONTENT rather than an id, because a call in progress has no stored row to name; the transcript is written when it ends. So the gate bounds it as content (a size ceiling, a newline-free bounded label) instead of pretending prose has a charset, and what defends it is the fence plus a system prompt that never interpolates it. `liveInjection.ts` (08c-2) — the pure fenced, budgeted caption block. It truncates from the FRONT, the opposite of a stored call: a live viewer is asking about what was just said, so keeping the head would drop the material on screen — and the surface says the opposite half too (`chat.liveTruncated`, not `chat.callTruncated`). **THE LAST TWO GROUNDINGS, AND THE DEATH OF THE OLD ROUTE** (08c-3): `documentInjection.ts`/`documentSource.ts` carry a MARKED REPORT PASSAGE — the page text fenced and budgeted per page (25,000 chars, split per page so a fat first page cannot slice the later ones away) — while ≤4 SNIPPED PAGE IMAGES ride the user turn as Anthropic image content blocks, each with a Hebrew caption naming its page. The images are the AUTHORITY on anything numeric; extraction routinely mangles a financial table the snip renders exactly as the user sees it. Both are a THIRD orthogonal question beside the union and the project (`TurnDocuments`), because multiview is a call AND a report at once. Unlike a call and LIKE a project, a page-text load that fails does NOT end the turn — the marked passage is already in the user message and the images arrived with the request, so what is lost is the surrounding prose: reported as `documentContext: failed`, answered around. That capability is what let `lib/chat/turnRoute.ts` (which chose v2 or the old route PER TURN) and `/api/chat` itself be deleted; `lib/chat/captionPayload.ts` is the one function that survived that file. `callInjection.ts`/`callSource.ts` (08b) — the pure fenced, line-id-anchored, budgeted call block and its one Supabase read; a call that cannot be loaded ends the turn in `error` before any model call, because answering from the corpus under a chip naming that call is the ticket-07 defect. `loop.ts` — the Sonnet 5 tool loop; every event is TYPED (`delta`/`tool`/`done`/`incomplete`/`error`), so error text has no code path into a `delta`. `terminal.ts` — the pure function deciding WHICH terminal event ends a turn, from the facts (stop reason, whether any text was emitted, unverified quotes, whether any source survived, whether any tool ran, the round-trip cap); swept exhaustively, because between them two review rounds found five holes in the inline guards it replaced. `done` is the only event meaning complete. `citations.ts` + `fence.ts` — quotes verified at write against the pool of text the turn's tools actually returned (the one choke point, given the real content rather than a proxy), and untrusted document titles defanged before they enter the prompt. `toolDefs.ts`/`tools.ts` — the tool registry over the shared corpus (`company_aliases`, `document_chunks`, `filing_facts`, `companies` — no user rows, so `supabaseAdmin` is the legitimate category per `db.md`). `systemPrompt.ts` — cache-READY prompt assembly (static block first, volatile last) and **nothing is cached today** (no `cache_control` anywhere; every cost run reads `cache_read 0 / cache_write 0`). **The stated REASON was wrong and is corrected here (measured 2026-08-15, Sonnet 5, `messages.count_tokens`):** this row and `systemPrompt.ts`'s own header said the cacheable prefix was ~880 tokens against a 1,024 minimum and therefore *could not* engage. Measured: static system **450**, `TOOL_DEFS` **1,174**, prefix **1,659 — 635 OVER the minimum**. The estimate derived tool tokens from char count at prose ratios; JSON schema runs ~1.8 chars/token, so the tool block is more than double the guess. Caching is AVAILABLE, not blocked — still unset, and the §5 budget still must not lean on it until a run is measured engaging. `tools.ts` is imported LAZILY by the loop, and itself lazily imports `db/workspaces`, because both construct/require server-only modules at load. |
| `db/workspaces.ts` | The workspace data layer. Queries through the **caller's own** Supabase client with a comment at each site saying RLS is load-bearing — the pattern to copy, alongside `db/projects.ts`. |
| `time/relative.ts` | Relative-time formatting ("2 hours ago") in both locales. |
| `agents/data.ts` | Design-demo agents feed (typed stub, to be replaced by real feed). Unit-tested. |
| `agents/budget.ts` | The one place the Managed Agents run budget is spelled: `RUN_BUDGET_CENTS` (100, founder-approved $1.00/run cap) and `runBudget()`, which builds the `max_list_cost` shape the SDK's beta sessions API expects — minor units as an integer string, `USD`. Settles spec §6: `max_list_cost` is expressible in `@anthropic-ai/sdk` 0.117.1 (`resources/beta/sessions/sessions.d.ts`), unlike the 0.102.0 that shipped before this ticket. Unit-tested. |
| `projects/data.ts` | Design-demo projects feed (typed stub, to be replaced by real feed). Unit-tested. |
| `demo/DemoStateProvider.tsx` + `demo/reducer.ts` | **Session-only** state for the three surfaces — the reason nothing on them persists. Deliberate: a real store would have locked in shapes before the data model was decided. Unit-tested (`demoState.test.ts`). |
| `demo/seedDocument.ts` | The working document's fabricated seed content, kept out of React so its DEMO markers are unit-testable. **Read the header before touching the quote block** — it invents financials and a quote from a NAMED executive of a real TASE issuer, and its marker cost three review rounds. Unit-tested. |
| `company/logo.ts` | Which image represents a company — stored `logo_url`, else an EXACT `tase_security_id` map. Pure so it can be tested; it used to live inside `db/companies.ts` behind `server-only`, where a name-substring guess put one issuer's mark on another for months. Unit-tested. |
| `company/resolve.ts` | The smart-layer company resolver (slice A2, spec §2.2 `resolve_company`): user language → `companies.id` over `company_aliases` rows. Pure, two-pass like `maya/issuers.ts` (exact-after-normalisation, then safe word coverage); ambiguity and unknowns return null honestly — the corpus holds BOTH refineries (בז"א ≠ בז"ן), so a guess is the wrong company's filings. Unit-tested, incl. the eval case-14 MUST-PASS offline. |
| `company/aliasSeed.ts` | What goes INTO `company_aliases`: derives the seed from live `companies` rows (name/display → registered, `name_en` → latin, `tase_security_id` → ticker) plus the hand-curated abbreviation list keyed by issuer id. Cross-company collisions are dropped from BOTH sides and reported, never coin-flipped. Pure. Unit-tested. |
| `calendar/event-meta.ts` | Event kinds: label, accent, tint, and `calendarEmptyState` — the single choke point deciding whether an empty month is empty or filtered. Unit-tested. |
| `company/documentCatalog.ts` | Pure: MAYA filings → years → periods → which filing fills the report/presentation slot of a period. Knows the Israeli filing calendar has no Q4 (Q1/Q2/Q3 + annual). Unit-tested. |
| `documents/openFiling.ts` | The `needsIngest` identity guard — what makes "no schema" safe. `company_documents` is unique on `(company_id, quarter, doc_type)` AND on `maya_report_id`, so a Hebrew/English pair or a correction and its original collide on ONE row; a stored row is served only when its `maya_report_id` IS the filing that was clicked, otherwise it is re-ingested. Unit-tested. **Not atomic** — see known gaps. |
| `maya/catalogCache.ts` | 5-minute per-(company, year) memory cache in front of `listDisclosures`, so re-opening a year does not re-spend the shared 10-req/2s MAYA budget. Unit-tested. |
| `maya/companyProfile.ts` | `company-details` row → the `companies` columns: sector hierarchy, website normalisation, logo URL, image magic-byte sniffing. Pure. Unit-tested. |
| `maya/schedule.ts` | Report-schedule row → calendar event: timezone resolution, `time_known`, dedupe. Pure. Unit-tested. |
| `maya/types.ts` | MAYA wire types, exactly as the API returns them. |
| `live/demoCompany.ts` | `LIVE_DEMO_TICKER` — the one place naming which company the live engine broadcasts, pending `/api/live/state` reporting it. |
| `types.ts` | The `Transcript` shape (= the shape of `formatted_data`). |
| `utils.ts` | Small helpers (`cn()` class merge, `isValidVideoUrl`). |
| `legacyBoundary.test.ts` | Build-enforced guard: Atlas roots may not import legacy folders (protects Wave 2). |
| `apiAuthBoundary.test.ts` | Build-enforced guard: every exported HTTP handler under `src/app/api` must resolve a signed-in user **and act on the result**, or be listed in its `PUBLIC` allowlist **with a reason**. Also bans any `DEMO_USER_ID` reference across `src/app` — the constant itself was deleted from `lib/api/types.ts` on 2026-08-03, so the ban is structural. Added because the holes it closes were months of drift, not one mistake, and because the fleet's own notes described them as "two routes" when a command found 16 sites in 8 files. It is a TEXT scan with stated limits in its own header: it proves the auth result is checked, **not** that the check precedes anything expensive, and **not** that the caller may touch the row it reads (that is the `lib/db` modules' job — most still use `supabaseAdmin`, which bypasses RLS). Fails closed on auth helpers it does not know and on handler shapes it cannot parse. |
| `api/client.ts` | The browser's fetch layer: `apiGet/apiPost/apiPatch/apiDelete`, plus `ApiError` (carrying the HTTP `status`), `isUnauthorized()` and the exported `handleResponse()`. **`handleResponse` is the only place allowed to decide what a failed request throws** — it was private, and `lib/projects/client.ts` promptly grew a second `throw new Error(...)` that lost the status, which made the sign-in-on-401 branch unreachable on every Projects screen. |
| `projects/client.ts` | The browser's door to `/api/projects*`. Owns its `cache: 'no-store'` and headers; delegates the failure path to `handleResponse` rather than throwing its own. |
| `db/conversationScope.ts` | Two pure decisions for the conversations layer: `isMissingTable(err, table)` (narrow — a missing *column* must not downgrade the whole process to the in-memory store) and `resolveProjectId(body)`, which parses an untrusted body and **carries no user identity by design**; the route resolves and refuses the caller itself. |
| `components/projects/ErrorLine.tsx` | The shared error line. Owns its own block wrapper (so a caller's flex layout cannot blockify the `<bdi>` and split one message across two rows) and, given an `auth` prop, renders expired-session copy plus a sign-in route via `loginRedirectTarget` when the thrown value is a 401 — which is why it takes the thrown value and not its message. |
| `api/errorShape.test.ts` | Build-enforced guard: any fetch layer reachable from an error banner that offers a sign-in route must throw `ApiError`, not a plain `Error`. Blanks comments before scanning, with a canary — its first version matched the word `ApiError` inside a comment and failed to bite when the bug was reintroduced to test it. **States its own limits in its header** (direct `@/…` imports only; the comment blanker is not a JS parser), because claiming "reachable" without them would repeat the counting failure it exists for. |
| `testRegistry.test.ts` | Build-enforced guard: every `*.test.ts` on disk is registered in `package.json`'s test script, and every registered path exists. Added after three test files were found to have never run. |
| `db/compositeChildFk.test.ts` | Build-enforced guard, `rules/db.md`'s ownership law one level deeper: text-scans `supabase/migrations/*.sql` for a table with an owner RLS policy (`using (auth.uid() = user_id)`, matched in both the per-table and 016's loop-generated shape) and fails for any single-column child FK into it — PostgreSQL referential-integrity checks bypass RLS, so a plain `agent_id → agents(id)` validates a row pointed at a stranger's parent row. Added after migration 032's first draft shipped exactly that shape across four new tables despite the spec already naming 015/016 as the pattern to copy. One grandfathered pre-existing violation (`quotes.folder_id → quote_folders`, migration 010, predates the law) is allowlisted by exact (file, table) pair. States its own limits: a text scan, not a catalog walk; a third policy-authoring shape (neither per-table nor array-loop) would be invisible to it. |
| `supabaseWriteDiscipline.test.ts` | Build-enforced guard, sibling of `apiFetchDiscipline.test.ts` (same law, same ratchet shape): an awaited supabase **write** in statement position — result discarded — fails the battery, because the supabase client never throws; the error rides the result object. Bought by the law's third occurrence (finishLiveCall's stub upserts, slice-A1 review). Skips whole comment lines when judging statement position — a comment ending in a period hid a real site from its first version. |
| `api/contextStatus.test.ts` | `sanitizeContextStatus` — the only narrowing between the `messages` jsonb and a rendered degradation notice. The server stores the field verbatim (proven by round trip), so an unrecognised value must land on `null`, never on a warning. |
| `../data/demo/liveCall.ts` | The demo live call (built from the kept Recall fixture) — loaded by `loadCall.ts`. |

### Tests (run via `npm test` — **1189 tests across 112 files** as of 2026-08-16; the list in `package.json` is explicit — add new test files there. The ship gate re-measures this header's pair whenever a battery run exists, so a stale edit is refused at merge)
Both numbers regenerated from commands, never edited by hand: the file count from
`package.json`'s test script, the test count from a real run. **`testRegistry.test.ts` now enforces
that the list is complete in both directions** — every `*.test.ts` on disk must be registered, and
every registered path must exist. It exists because three files had been written, were passing when
invoked directly, and never ran in the battery: `api/errorShape.test.ts` (for an hour) and
`live/search.test.ts` + `live/syncEngine.test.ts` (10 tests, far longer). A battery that does not
run a file cannot tell you it is missing.

`agents/budget.test.ts` · `agents/data.test.ts` · `api/chat2.test.ts` · `api/errorShape.test.ts`
· `apiAuthBoundary.test.ts` · `apiFetchDiscipline.test.ts`
· `auth/gate.test.ts` · `auth/verifyUser.test.ts`
· `calendar/event-meta.test.ts` · `chat/attachments.test.ts`
· `chat/contextStatus.test.ts`
· `chat/domainBoundary.test.ts` · `chat/history.test.ts`
· `chat/incompleteCopy.test.ts` · `chat/messageFlags.test.ts`
· `chat/projectContext.test.ts` · `chat/captionPayload.test.ts`
· `chat2/citations.test.ts`
· `chat2/callInjection.test.ts` · `chat2/documentInjection.test.ts` · `chat2/fence.test.ts`
· `chat2/liveInjection.test.ts` · `chat2/loop.test.ts` · `chat2/mode.test.ts`
· `chat2/projectInjection.test.ts` · `chat2/protocol.test.ts`
· `chat2/requestScope.test.ts`
· `chat2/terminal.test.ts` · `chat2/tools.test.ts`
· `company/aliasSeed.test.ts` · `company/documentCatalog.test.ts`
· `company/logo.test.ts` · `company/matchRank.test.ts`
· `company/resolve.test.ts` · `corpus/align.test.ts`
· `corpus/chunker.test.ts` · `corpus/diversify.test.ts`
· `corpus/embed.test.ts` · `corpus/indexHealth.test.ts`
· `corpus/reindex.test.ts` · `corpus/retrieve.test.ts`
· `correction.test.ts` · `curationAuthz.test.ts`
· `db/compositeChildFk.test.ts` · `db/conversationScope.test.ts` · `db/transcripts.test.ts`
· `demo/demoState.test.ts` · `design/anim.test.ts`
· `documents/extract.test.ts` · `documents/openFiling.test.ts`
· `documents/snip.test.ts` · `environment.test.ts` · `i18n/format.test.ts`
· `legacyBoundary.test.ts` · `live/askGrounding.test.ts`
· `live/finishLiveCall.test.ts`
· `live/ivritStitcher.test.ts` · `live/liveTiming.test.ts`
· `live/pcmChunker.test.ts` · `live/search.test.ts`
· `live/snipBridge.test.ts` · `live/syncEngine.test.ts`
· `live/syncMode.test.ts` · `live/wavEncode.test.ts`
· `maya/catalogCache.test.ts` · `maya/client.test.ts`
· `maya/companyProfile.test.ts` · `maya/dates.test.ts`
· `maya/disclosures.test.ts` · `maya/events.test.ts` · `maya/files.test.ts`
· `maya/filings.test.ts` · `maya/issuers.test.ts`
· `maya/latestOfEach.test.ts` · `maya/layering.test.ts`
· `maya/limiter.test.ts` · `maya/schedule.test.ts`
· `maya/syncFilings.test.ts` · `maya/xbrl.test.ts`
· `player/viewers.test.ts` · `projects/data.test.ts`
· `projects/derive.test.ts` · `projects/validate.test.ts`
· `scripts/lib/measure-core.test.ts` · `shipGate.test.ts`
· `supabaseReadDiscipline.test.ts` · `supabaseWriteDiscipline.test.ts`
· `testRegistry.test.ts` · `transcriptBirthDoor.test.ts`
· `transcriptDate.test.ts` · `transcription.test.ts`
· `workspace/blocks.test.ts` · `workspace/chat/compose.test.ts`
· `workspace/chat/context.test.ts` · `workspace/chat/plan.test.ts`
· `workspace/chat/prompt.test.ts` · `workspace/chat/promptInjectionDiscipline.test.ts`
· `workspace/clip.test.ts`
· `workspace/data.test.ts` · `workspace/intake/agreement.test.ts`
· `workspace/intake/companyPin.test.ts` · `workspace/intake/notice.test.ts` · `workspace/intake/findSources.test.ts` · `workspace/intake/json.test.ts`
· `workspace/intake/parseRequest.test.ts`
· `workspace/intake/respond.test.ts`
· `workspace/intake/selectSources.test.ts` · `workspace/panes.test.ts`
· `workspace/present.test.ts` · `workspace/tabLabel.test.ts`
· `workspace/thread.test.ts` · `workspace/validate.test.ts`.

> ⚠ **REGENERATED 2026-08-09 FROM `package.json`, and what it had drifted into is the argument for
> never hand-editing it.** Measured by diffing the old list against the registered set:
> **38 names listed, of which 1 is a phantom** (`demo/seedDocument.test.ts`, which `git ls-files`
> says does not exist) — so 37 real entries against a registered **65**, with **28 missing**:
> 9 of the 10 `maya/*` tests, 17 of the 18 `workspace/*` tests, plus `live/syncMode.test.ts` and
> `player/viewers.test.ts`. It sat directly under the sentence below promising it is emitted by a
> script, and the count in the heading was three merges stale for the same reason.
>
> ⚠ **CORRECTED, because the first version of this very blockquote got its own numbers wrong** —
> it said "37 entries" and "every `maya/*` and every `workspace/*` test was missing", both
> hand-derived and both false (one of each was present). A cold reviewer caught it in a commit
> titled *"four claims that a command contradicts"*. **Third filing of the same law: a count in a
> document comes from a command, and that applies to the count you write while fixing a count.**

> **This list is DERIVED FROM `package.json` BY A COMMAND, never edited by hand.** Run this and
> paste the result — it is the only sanctioned way to change the list:
>
> ```
> node -e "const p=require('./package.json');console.log(p.scripts.test.split(/\s+/).filter(s=>s.endsWith('.test.ts')).map(s=>s.replace(/^src\/lib\//,'')).sort().join(' · '))"
> ```
>
> ⚠ **This paragraph used to say the list "is emitted from `package.json` by a script".
> NO SUCH SCRIPT EXISTS** — `git ls-files scripts/` has never held one, and `testRegistry.test.ts`
> enforces only `package.json` ↔ disk, never this document ↔ `package.json`. So the sentence
> promising the list could not be hand-edited was itself the thing letting it rot to 38 entries
> against 65, and it survived the 2026-08-09 correction of the blockquote directly above it.
> A claim that a document is machine-generated is a claim like any other: it needs a command.
>
> The note that used to sit here is the same lesson one turn earlier. It read: *"it previously
> named `live/syncEngine.test.ts` and `live/search.test.ts`, neither of which is in the runner."*
> That was true when written and was made FALSE by the very commit that left it standing — those
> two files were registered in it. `testRegistry.test.ts` guarantees the SET on disk is right;
> only the command above keeps THIS list honest.

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
- **Documents (Multiview):** `ingest-document.ts` (CLI: PDF → private bucket + per-page extracted
  text; idempotent per company+quarter+type — its core becomes the MAYA auto-fetch later),
  `retranscribe-call.ts` (CLI: additive re-transcription with karaoke word-timings for
  pre-karaoke rows; writes a NEW `<id>_live` row).
- **MAYA sync (2026-08-09):** `maya-refresh-issuers.ts` (the issuer universe; `--sweep` reaches
  tier 2 — the ~500 companies that file but never hold a call, deliberately not synced yet),
  `sync-maya-calendar.ts` (report schedule → `scheduled_calls`, upserting on the migration-021
  natural key; re-runnable, proven to produce 0 duplicates on a second full run),
  `sync-maya-companies.ts` (`company-details` → sector/sub-sector/description/website/logo on
  `companies`; **never overwrites a human-written value, per FIELD not per row**, detects TASE's
  shared placeholder logos by uniqueness rather than a pinned hash, and decides what is an image
  by magic bytes because MAYA's content-type lies). **The two sync scripts** take `--dry-run`;
  `maya-refresh-issuers.ts` does not (`[--sweep] [--from N] [--to N]`).
- **Smart layer (2026-08-13):** `seed-company-aliases.ts` (seeds `company_aliases` from live
  `companies` + the curated list in `src/lib/company/aliasSeed.ts`; takes `--dry-run`;
  insert-only on UNIQUE(alias) so a re-run after new companies only adds — repointing an
  existing alias is a by-hand founder decision, never a sweep side effect).
  ⚠ `tsconfig.json` excludes `scripts/`, so **`npx tsc --noEmit` does NOT typecheck these** —
  running them against live data is the only gate they get.
- **Coordination:** `append-log.mjs` — the sanctioned append-only door to `COLLISIONS.md`
  (allow-listed in `.claude/settings.json`; ad-hoc shell appends are classifier-blocked).
- **`retrieval-eval/`:** the standing retrieval quality gate (smart-layer ticket 07) —
  `run.mjs` scores candidate retrieval designs against `docs/eval/retrieval-eval-set.md`
  (mirrored with resolved anchors in `cases.json`) on the live corpus, entirely in-process
  (brute-force cosine + in-memory BM25; embeddings cached to git-ignored `cache/`). Results
  land in `results/`. Every future retrieval change is judged by it — see its README.
  **Runs via `node --import tsx`** since slice A3: its chunker IS the production module
  (`src/lib/corpus/chunker.ts`) — one chunker, by law; the swap reproduced the measured
  results exactly.
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
| `20260714_012_company_documents` | **`company_documents` + `document_pages`** (RLS, read=authenticated) + private `company-documents` bucket — Multiview M1 |
| `20260716_013_user_quotes_rls` | RLS enable on parked `user_quotes` (Advisor finding; applied founder-side) |
| `20260801_014_transcripts_shared_corpus` | `transcripts` RLS as a **shared corpus** read (`for select to authenticated using (true)`) — see `docs/DATA-MODEL.md` |
| `20260802_015_projects` | **`projects`** + project messages (Projects backend) |
| `20260803_016_workspaces` | **`workspaces`, `workspace_items`, `workspace_threads`, `workspace_doc_blocks`** — all four ownership-law points at CREATE TABLE, composite FKs `(id, user_id)` so referential integrity cannot reach across owners |
| `20260803_017_workspace_integrity` | Three holes in 016: kind-matches-source, storage uniqueness, and a citation that could reach across workspaces |
| `20260806_018_workspace_items_unique_source` | Two unique indexes that **duplicated 016/017's exactly** — applied in error, disclosed in its own file, retired by 020 |
| `20260806_019_maya` | **`maya_issuers`** (shared corpus, read-only to members) + `companies_tase_issuer_uniq` + `company_documents.maya_report_id` |
| `20260808_020_remove_redundant_workspace_item_indexes` | Retires 018's two duplicates. **Applied by the founder by hand** — `drop index` is hook-blocked on both doors and has no approval override; the file is the record, not an instruction |
| `20260809_021_scheduled_calls_maya` | MAYA identity on `scheduled_calls` (the upsert key `sync-maya-calendar.ts` targets) |
| `20260813_022_pgvector` | `CREATE EXTENSION vector` (schema `extensions`) — smart-layer slice A1 |
| `20260813_023_company_aliases` | **`company_aliases`** — the company resolver's data (shared corpus, read=authenticated) |
| `20260813_024_document_chunks` | **`document_chunks`** + `atlas_dual_tsv()` — the retrieval substrate: exactly-one-source + anchors-match-source CHECKs, generated `source_type`, HNSW (cosine) + dual-form-tsvector GIN, verbatim `content` separate from `embedding_input` |
| `20260813_025_filing_facts` | **`filing_facts`** — XBRL numerics per MAYA filing, `UNIQUE NULLS NOT DISTINCT (report, concept, period)` |
| `20260813_026_company_documents_publication_date` | `company_documents.publication_date` — publication is a different fact from ingestion (`created_at`) |
| `20260813_027_transcripts_identity` | `transcripts.source_key` (+ partial UNIQUE — dedup at birth) + `revision` + `CHECK (company_id IS NOT NULL) NOT VALID` (born-attributed law at the DB; VALIDATE lands in slice A4) |
| `20260813_028_index_status_atomic_rechunk` | `index_status` on `transcripts` + `company_documents` (pending/indexed/failed/excluded — an embedding failure is VISIBLE), `company_documents.facts_status` (facts/none/failed — never zeros), and `atlas_replace_chunks()` — the one-transaction chunk swap with server-side embedding carry-forward; EXECUTE revoked from public/anon/authenticated |

`supabase/config.toml` = Supabase CLI config. **The DB is shared with the frozen old repo —
additive migrations only.**

### Root config
`package.json` · `tsconfig.json` · `next.config.js` · `tailwind.config.ts` · `postcss.config.js` ·
`nixpacks.toml` (Railway build) · `CLAUDE.md` · `PROGRESS.md` · `LEGACY.md` · this file.

### Static assets
`public/atlas-anim.js` (GSAP animation bootstrap, consumed by `AnimCanvas.tsx`) ·
`public/brand/` (logo variants — `atlas-wordmark.{png,svg}`, `atlas-A.svg`, `tase-mark.png` — generated by `prep-brand-assets.mjs`) ·
`public/pdf.min.mjs` + `public/pdf.worker.min.mjs` (committed pdfjs-dist 5.4.296 copies, imported
natively by `PdfViewer.tsx` because Next 14's webpack mangles the pdfjs ESM bundle — **re-sync BOTH
on any pdfjs-dist bump**; pdfjs-dist is exact-pinned `5.4.296` as a direct dep since 2026-07-23 so
a pdf-parse bump can't silently desync it).

### Harness — `.claude/` (the smart environment, built 2026-07-02)
| File | What it does |
|---|---|
| `settings.json` | Permissions (safe pre-approvals + secret denies) + the two hook wirings. Tracked in git so every worktree gets the same harness. |
| `settings.local.json` | Machine-local permissions (git-ignored). |
| `hooks/pre-bash-gate.mjs` | PreToolUse gate: blocks destructive SQL, unsafe `rm -rf`, `.env` shell access, force-pushes, pushing `main` from a worktree, whole-file writes to the append-only log, and a merge onto `main` that has not passed the ship gate. Fire-tested — run `node .claude/hooks/gate-tests.mjs` for the case count. |
| `hooks/post-edit-verify.mjs` | PostToolUse: auto-formats every edited `.ts/.tsx` + incremental typecheck; errors feed straight back to the session. |
| `rules/db.md` | Shared-with-production DB: additive-only migration law. |
| `docs/live-engines.md` | Live-engine gotchas (restart-per-test, stale bundle, caption lag…). Was `rules/live.md` until 2026-08-12 — it is FACTS, not laws, so it loads on demand instead of every session (ADR-0001). |
| `rules/app.md` | App **invariants**, always in context. 4 meta-laws, then auth & authorization · bidi & localization · time · UI truthfulness · media & documents · platform · verification traps. Each law is LAW / ENFORCED / VERIFY + a case anchor. Split + restructured 2026-08-10 (4,121 → 2,351 words); open findings moved out 2026-08-12. |
| `docs/open-findings.md` | Open items that are **NOT laws** — unauthenticated live audio endpoints, the absent `.gitattributes`, two UTC leaks. Was the last section of `rules/app.md` until 2026-08-12; moved out because the always-on set is reserved for law (`CONTEXT.md`). Read on demand. |
| `docs/case-history/app.md` | The forensic record behind each `rules/app.md` law — verbatim, 24 entries, linked by anchor. NOT auto-loaded; read on demand. |
| `skills/verify-app/` | `/verify-app` — self-seeing verification loop (Chrome MCP screenshots) + per-surface recipes. |
| `skills/ship/` | `/ship` — the shipping ritual. |
| `skills/live-test/` | `/live-test` — run a real Recall+Zoom live test end-to-end. |
| `skills/transcript-review/` | `/transcript-review` — the transcript-quality gate. |
| `agents/atlas-reviewer.md` | `atlas-reviewer` agent definition — the code/design review persona. |
| `hooks/gate-tests.mjs` | Fire-test matrix for pre-bash-gate.mjs — run + extend it on EVERY hook change. |
| `scripts/lib/env-manifest.mjs` | The always-on set, its token budget, the append-only registry, and the law parser — declared once. `src/lib/environment.test.ts` asserts against it, `npm run env:health` prints from it and `scripts/append-log.mjs` derives its doors from it, so the guard and the number cannot disagree (ADR-0002). |
| `scripts/lib/ship-gate.mjs` | The two merge-time rituals as pure functions: eviction (STATUS.md rewritten, PROGRESS.md appended, closed `.scratch/` notes archived) and promotion (every review finding answers the recurrence question; a recurrence buys a stronger mechanism). Plus the Verified-count check (founder decision 2026-08-13): a `Verified: N/N` claim in the branch's new PROGRESS lines is re-measured against a battery run the gate makes itself. Tested in `src/lib/shipGate.test.ts`. |
| `scripts/ship-gate.mjs` | `npm run ship:gate` — the git half. Prints the generated "what only you can check" list and the unenforced-law count, then fails on the rituals above. Also run by the hook at `git merge` onto main, so it does not depend on anyone reading `/ship`. |

**Session memory (ADR-0001).** There is no shared brain. A session integrates through `main` and
coordinates only on collisions, via `COLLISIONS.md` at the repo root (append-only, current era).
Founder decisions go to `DECISIONS.md`, permanently. The retired fleet's board, per-seat state
files, logs, `parallel-work.md` and launch kit are verbatim in
`docs/archive/agent-memory-snapshots/2026-08-12-fleet-retired/`. Founder-provided inputs:
`design-import/` (Claude Design export), `local-assets/` (demo PDF).

### Docs — `docs/`
`docs/superpowers/{specs,plans}/` = the dated spec/plan for each feature built (history — keep).
`docs/V1-SECURITY-AND-LAUNCH-NOTES.md` = security/launch checklist.

---

## 8. Known gaps (flagged, deliberate — not mess)

The 2026-07 cleanup resolved the old "two products in one tree" clutter. What remains is a short,
honest list:

1. ✅ **CLOSED — this item was STALE and is corrected here (2026-08-08).** It claimed
   `getSession()` was still resolving users and that `PATCH …/speakers`, `PATCH …/diarization`
   and `POST /api/live/finish` had no auth at all. Both were fixed on 2026-08-02/03 and this
   document was never updated. Verified by command at this merge: `git grep "auth.getSession()"
   -- src` returns **0**, and all three routes resolve a user. Auth is now enforced by a TEST —
   `src/lib/apiAuthBoundary.test.ts` fails the battery for any handler that resolves no user.
   **What remains true and is NOT closed:** authentication is not authorisation. `supabaseAdmin`
   bypasses RLS, and the older `lib/db/` modules (`conversations`, `quotes`, `quoteFolders`,
   `transcripts`, …) still use it and do their own ownership filtering in application code.
   `lib/db/workspaces.ts` and `lib/db/projects.ts` are the pattern to copy. Also still open by
   design: `GET /api/live/{state,pcm}` are allowlisted — **gate them before `LIVE_ENGINE_URL`
   is ever set in a deployed environment.**
2. **Wave 2 gateway** — 4 legacy-styled files serve login until Atlas has its own (see `LEGACY.md`).
3. **`LiveAudioProvider` re-render pattern** — 10fps values in context; port `PlayerProvider`'s
   `useSyncExternalStore` pattern before adding more consumers (reviewer flag, 2026-06-27).
4. **Finish-trigger lives on the live page** — if the user navigates away at the exact moment a call
   ends, the finish fires only when they return. Handle before report-season concurrency.
5. **Inert legacy DB tables** (watchlist/alerts/etc. in shared Supabase) — harmless; clean up at
   deployment time, coordinated with the old repo's retirement. (The 4 foreign tables from a
   non-Timlul project were founder-DROPPED 2026-07-16.)
6. **The workspace intake's standing proposal is not durable** (filed 2026-08-08 at the
   `feat/workspace-tables` merge, by the lane itself while verifying its own fix). Any non-empty
   model selection replaces the standing set however far it diverges, so Atlas can name three
   filings in prose while storing a different two — measured 6/6 turns substituting a file, one
   never named to the analyst. A bare "כן" then pulls that stored set verbatim. **It is the first
   item of the next intake branch**, and it is a design decision (when may a model selection
   replace an agreed set?), which is exactly the question that opened a new door in each of the
   two preceding fix rounds — hence deferred deliberately rather than patched at the end of one.
   Bounded, not unbounded: the shipped `intakeResult` invariant means a resolution failure asks a
   question instead of announcing a pull.
7. **`lib/maya/ingestFiling.ts` upserts on `(company_id, quarter, doc_type)`**, so a different
   filing mapping to the same period+type replaces the SHARED-corpus row in place while other
   users' `workspace_items.name` keeps the old title. Now reachable by any authenticated user via
   `POST /items/from-maya`. The correct key is `maya_report_id`, whose unique index is PARTIAL,
   which PostgREST's `onConflict` cannot express — so the fix is DDL and travels with the
   publication-date column in the MAYA phase. One migration, one review.
   **Addendum 2026-08-09 (`feat/documents-catalog`): `lib/documents/openFiling.ts`'s `needsIngest`
   guard is what keeps this safe for the USER — a stored row is served only when its
   `maya_report_id` IS the filing that was clicked, otherwise it is re-ingested — but the guard is
   NOT ATOMIC.** Two users opening the Hebrew and the English edition of one period at the same
   moment both pass the check; the row ends pointing at one of them and the loser is served the
   document they did not click. It self-heals on the next open, and the same DDL closes it
   properly. Filed by the merge reviewer; the branch's headline claim "never serves one you did
   not click" has this window and the evidence did not mention it.
8. **`components/agents/` is still demo-fed** and carries its `DemoBanner`; agent execution needs
   the deploy. **The company-overview extras and the "Q2 2026" quarter tag are CLOSED
   (2026-08-09): `lib/company/overview-stub.ts` is deleted and all three literals are removed —
   sector, sub-sector and description are real on 234/234 companies from MAYA `company-details`.**
   The IR contact and index chips deleted with the stub are both restorable as FACTS from that
   same endpoint (phone/email/address; `securityIncludedIndices` with weights) and must return as
   data or not at all.
