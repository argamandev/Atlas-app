# Timlul Frontend (Quartr-style, bilingual) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan is
> executed inline by the authoring session (the user is away and asked for an autonomous build +
> self-test). Verify after every phase: `npx tsc --noEmit`, then a dev-server smoke test.

**Goal:** Build the Timlul investor-transcript web app frontend — a near-monochrome, macOS-feel,
bilingual (EN/LTR default ⇄ HE/RTL) product modeled on the Quartr reference — inside the existing
Next.js 14 app, wired to the real backend (and building the backend gaps it needs).

**Architecture:** Next.js 14 App Router (NOT a new Vite app — the backend lives here). A
centralized design-token layer + shared primitive components (§3.6 of the brief) drive every page.
i18n extends the already-built cookie-based locale foundation (`src/lib/i18n/`). The crown-jewel
Live Transcript page uses a framework-agnostic **sync engine** driven by an `<audio>` element's
`currentTime`; word-level karaoke uses Recall per-word timestamps (the spike fixture is the
self-test data source), degrading to line-level for YouTube/IVRIT transcripts.

**Tech Stack:** Next.js 14 (App Router, RSC + route handlers), TypeScript, Tailwind (existing),
the existing i18n foundation, Supabase (Postgres/Auth/Storage), `@anthropic-ai/sdk` (already a dep)
for chat.

---

## Critical decisions & corrections to the brief

1. **Next.js, not Vite/react-i18next.** The brief's §8 suggests React+Vite+react-i18next. We are
   in an established Next.js 14 app with the backend co-located. Forking to Vite would sever the
   backend. We extend the existing `src/lib/i18n/` foundation (cookie-driven `dir`+font+dictionary,
   already proven switching EN↔HE at runtime). It satisfies every i18n requirement (no hard-coded
   strings, reactive `dir`/`lang`, font switch) without a new lib.
2. **This is a near-total reskin.** The existing app is dark (`#050505`, accent `#C04A00`), Hebrew-
   first. The new product is light, near-monochrome, English-first, macOS-feel. The new V1 app
   (Home/Calendar/Chat/Company/Live) is built fresh under a new light theme + design tokens. The
   existing transcription **backend** (pipeline, `transcripts` table, auth) is reused as-is. Old
   dark landing/dashboard pages are left in place but are not part of the V1 product surface.
3. **Backend gaps to build** (the brief assumes these exist; they don't): `GET` companies, `GET`
   scheduled calls, `POST/GET` chat (Anthropic context-stuffing), quotes table + CRUD. "Add
   Investor Call" reuses the real `POST /api/transcripts`. Live productionization (Recall webhook,
   `live_calls` table) is OUT OF SCOPE for this pass — Live page runs on replay + the spike fixture
   for live-feel demo, with a clean seam for the real feed.
4. **Karaoke data source.** Word-level sync needs per-word timestamps. Confirmed available only in
   Recall data (`scripts/fixtures/recall-spike.transcript.json` — real Hebrew word timings) with
   matching audio (`scripts/out/bakeoff-audio.mp3`). These become a seeded demo call so the karaoke
   + word-click-seek can be genuinely self-tested. Production transcripts (line-level string
   timestamps only) degrade to line-level highlight.
5. **Fonts.** EN UI = Inter (documented fallback for the reference's SF-Pro-like face). HE UI =
   Calibri Regular with a Hebrew fallback stack (`'Calibri','Segoe UI','IBM Plex Sans Hebrew',...`).
6. **Real-time mechanism.** Live Now / live transcript use polling against our DB for this pass
   (simple, robust, demoable); WebSocket/SSE is a later swap behind the same client interface.

---

## File structure

```
src/
  app/
    (app)/                      # NEW route group = the V1 product shell (light theme)
      layout.tsx                # AppShell: macOS window frame + 3-layer sidebar + LocaleProvider
      home/page.tsx
      calendar/page.tsx
      chat/page.tsx
      company/[id]/page.tsx
      live/[id]/page.tsx        # the crown jewel
      settings/page.tsx
    api/
      companies/route.ts                 # NEW  GET list/search
      companies/[id]/route.ts            # NEW  GET one + its calls + quotes
      calls/route.ts                     # NEW  GET scheduled_calls (All / mine)
      calls/follow/route.ts              # NEW  POST/DELETE follow (My Calendar)
      chat/route.ts                      # NEW  POST (Anthropic, transcript-grounded)
      chat/threads/route.ts              # NEW  GET/POST chat history
      quotes/route.ts                    # NEW  GET/POST quotes
      transcripts/...                    # EXISTING (reused for Add Investor Call)
  components/
    app/                        # NEW shell
      AppShell.tsx  IconRail.tsx  ExpandedPanel.tsx  MacWindowFrame.tsx  SidebarFooter.tsx
    ds/                         # NEW design-system primitives (§3.6)
      Surface.tsx  EntityRow.tsx  SectionHeader.tsx  Tabs.tsx  IconButton.tsx
      Logo.tsx  Avatar.tsx  SelectableRow.tsx  icons.tsx
    media/
      MediaPlayer.tsx           # §5.5.1 docked charcoal pill
    chat/
      ChatComposer.tsx          # §5.3.1
      MentionDropdown.tsx       # §5.3.2
      CitationPopover.tsx
    live/
      TranscriptBody.tsx  SpeakerBlock.tsx  KaraokeText.tsx  QuoteToolbar.tsx
  lib/
    i18n/                       # EXISTING — extend dictionaries + add Calibri/Settings toggle
    design/tokens.ts            # NEW single source of truth (colors/radii/shadow/spacing/z)
    api/                        # NEW typed client layer (one module per domain)
      client.ts companies.ts calls.ts transcripts.ts chat.ts quotes.ts user.ts
    live/
      syncEngine.ts             # NEW framework-agnostic word/line sync (pure, unit-tested)
      recallAdapter.ts          # NEW Recall words → WordTimedTranscript
  data/
    demo/copart-live.ts         # NEW seeded demo call built from the recall fixture
supabase/migrations/
  20260613_007_quotes_followed_calls.sql   # NEW
```

---

## Phases (map to brief §9 build order)

### P0 — Design tokens + theme + i18n hardening  *(foundation; verify before moving on)*
- [ ] `src/lib/design/tokens.ts`: export `tokens` — `color` (surface scale white→warm-gray,
      text black/gray steps, `playerCharcoal`, reserved `live` red `#E5484D`), `radius`
      (sm/md/lg/pill), `shadow` (window/popover/player only), `space`, `z`. No other component
      may hardcode hex/radius/shadow.
- [ ] Tailwind: add a `light` token set mapped to CSS vars; add `font-calibri`; keep `font-latin`
      (Inter). Add logical-property safety (Tailwind 3.4 logical utils `ms/me/ps/pe/start/end`).
- [ ] i18n: add `he` Calibri font selection in layout; full `en`/`he` dictionaries for all V1
      strings; move the language toggle into Settings (keep it reachable). Persist via existing
      cookie (already SSR-correct).
- [ ] Verify: `tsc` clean; dev server renders a token test; toggle flips EN↔HE + font.

### P1 — App shell (macOS window + three-layer sidebar)
- [ ] `MacWindowFrame`: floating white window, `radius.lg`, `shadow.window`, marble backdrop,
      traffic-light dots (leading).
- [ ] `IconRail` (Home/Calendar/Search/Chat/… + active selection token), `ExpandedPanel`
      (section-contextual), content slot. `SidebarFooter` (Profile + Settings). All logical-prop
      mirrored; rail = leading edge (left EN / right HE).
- [ ] `(app)/layout.tsx` composes the shell + `LocaleProvider`.
- [ ] Verify: shell renders EN-left / HE-right; active nav uses selection token.

### P2 — DS primitives (§3.6) — build once, reuse everywhere
- [ ] `Surface` (white|charcoal, soft shadow, no border), `EntityRow` (logo/avatar→bold name→
      gray secondary→trailing meta), `SectionHeader`, `Tabs` (underline active), `IconButton`
      (line vs filled-primary), `Logo` (rounded-square), `Avatar` (circle), `SelectableRow`,
      `icons.tsx` (one monochrome line set: chevron/sparkle/⋮/⤢/✕/sync/copy/search/speaker/±15).
- [ ] Verify: a primitives gallery route renders all, both directions.

### P3 — Backend read-APIs + client layer
- [ ] `lib/api/*`: typed client per domain with central base/auth/error. Mock fallback where a
      contract is unknown (flag with `// TODO: confirm`).
- [ ] `api/companies` + `api/companies/[id]` (read `companies`, join `scheduled_calls`).
- [ ] `api/calls` (scheduled_calls All/mine), `api/calls/follow`.
- [ ] Migration `20260613_007`: `quotes` + `followed_calls` tables (+RLS) ; `api/quotes`.
- [ ] Verify: endpoints return seeded 4 companies + 4 calls; `tsc` clean.

### P4 — Home page
- [ ] Time-based greeting + user name; subheader; centered company search (→ company page);
      "Upcoming Investor Calls" (EntityRow, sorted nearest-first from `scheduled_calls`);
      "Live Now" expanded-panel (live calls; clean empty state).
- [ ] Verify: renders seeded calls; search navigates; both directions.

### P5 — Company page
- [ ] Header (logo/name/industry/sub, top-trailing). `Tabs`: Overview (latest call, upcoming,
      My Quotes by quarter), Investor Calls (backlog by quarter). "Add Investor Call" → real
      `POST /api/transcripts` (progress states). ⋮ menu → "Open in Chat". "Open in Chat" (company).
- [ ] Verify: Themis/Tigbur pages render; Add Call validates a YouTube URL and starts the pipeline.

### P6 — Live Transcript page  *(MOST IMPORTANT — give it the most care; self-test)*
- [ ] `lib/live/syncEngine.ts` (pure): given `WordTimed[]`/`LineTimed[]` + `currentTime` →
      `{ activeWordIndex, activeLineId, spokenBefore }`. Unit-test the boundaries (TDD).
- [ ] `recallAdapter.ts`: recall fixture → `WordTimedTranscript`. `data/demo/copart-live.ts`
      seeds a demo call (words + `bakeoff-audio.mp3`).
- [ ] Page: floating panel; header (logo+title+date+LIVE pill+chevron / trailing sparkle+expand+
      close); Tabs (Overview/Transcript/Slides/Report) + inline audio chip; sub-toolbar
      (sync-follow + copy / Search); `SpeakerBlock`; `KaraokeText` (spoken near-black, upcoming
      fades gray, active word highlight); click-word→seek; selection→quote save; virtualized body.
- [ ] `MediaPlayer` (§5.5.1) docked; live = red scrubber+handle, recorded = segmented ticks.
- [ ] **Self-test:** load demo call, play audio, assert highlight advances with `currentTime`,
      assert clicking a word seeks audio to that word's `start`, assert quote-save persists.
- [ ] Verify: both directions; word-click latency low.

### P7 — Chat page (+ chat backend)
- [ ] `api/chat` (Anthropic `@anthropic-ai/sdk`, context-stuff selected company's latest
      transcript `formatted_data`; `/company` slash + `@mention` set context). `api/chat/threads`
      history.
- [ ] `ChatComposer` (§5.3.1 two-row), `MentionDropdown` (§5.3.2 Watchlists group, keyboard),
      slash typeahead, history panel, My Agents/My Skills (stub UI), `CitationPopover` on grounded
      answers. Borderless answer tables like the reference.
- [ ] Verify: a real question about a seeded company returns a grounded answer; mention/slash work;
      both directions.

### P8 — Calendar + polish
- [ ] Month view (logos+times), All/My toggle, drag-to-follow (RTL-correct DnD).
- [ ] Polish pass: match reference feel; full RTL mirror audit; a11y (keyboard/focus/ARIA/contrast);
      loading/empty/error on every page.
- [ ] Final verify: `tsc`, `npm test`, dev-server smoke of every route both directions; live self-test.

---

## Backend contracts & assumptions (brief §7/§10 — to confirm with Sagi)

- **Auth:** reuse Supabase SSR cookie session; app routes already middleware-protected. Chat/quotes
  endpoints gate on `getCurrentUser`.
- **Companies/calls:** served from the seeded `companies` + `scheduled_calls` tables (V1 data layer).
- **Chat:** assumed contract — `POST /api/chat { threadId?, message, companyId? }` → streamed/text
  answer + optional citations; grounding = stuff the company's latest `formatted_data` transcript
  into the system prompt (context-stuffing, no vector DB, per CLAUDE.md). `// TODO: confirm` model +
  token budget.
- **Quotes:** new table `quotes(id, user_id, company_id, transcript_id, text, quarter, start_sec?,
  created_at)`.
- **Live feed:** NOT productionized this pass. Live page consumes replay + the recall demo; real
  Recall webhook/`live_calls` is a separate mission (Core 1 productionization).
- **Per-word timestamps:** only Recall data has them; YouTube/IVRIT path degrades to line-level
  highlight (no word-click-seek) until IVRIT word timestamps are requested.
- **Audio for completed calls:** not yet stored (Recall retention deletes; YouTube audio is
  transient). Demo uses the spike audio; production audio storage is a later mission.

## Self-test definition of done (the part Sagi asked to be proven)
Live page loads the seeded demo call → audio plays → karaoke highlight tracks `currentTime` →
clicking a word seeks the audio to that word → saving a selection creates a quote row. Verified via
a dev-server smoke test + a headless check of the sync engine, reported with evidence.
