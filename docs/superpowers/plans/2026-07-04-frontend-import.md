# Frontend Import (Claude Design → Atlas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the Claude Design frontend — layout, animations, aesthetics — faithfully into the Atlas Next.js app for Home, Calendar, Chat, Company (+tabs), Call view, and Ask Atlas, keeping real backend wiring; Workspace/Agents land as navigable stubs.

**Architecture:** Upgrade-in-place. Token/font layer first, then the black-rail shell (with stub routes), then page-by-page restyle in founder-locked order. Animations are copied verbatim from the design sources into a shared CSS + canvas module. Every page passes the verify-app side-by-side protocol before its commit ships.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind (tokens in `src/lib/design/tokens.ts`), existing i18n (`src/lib/i18n`), Chrome MCP for verification.

## Global Constraints

- Worktree: `C:/Users/Sagi/Desktop/Atlas-frontend`, branch `feat/frontend-import`, dev port **3001** (`npm run dev -- -p 3001`). Never push main.
- Design source of truth: `design-import/Atlas MVP.dc.html` (2205 lines; section map: rail 38–89 · Home 94–166 · Calendar 167–215 · Call 216–431 (`inCallChat` 404) · Company 432–647 · Chat 648–749 · Workspace 750–1196 · Agents 1197–1316 · docked player 1318+), `design-import/atlas-anim.js`, `design-import/reference/live-beam.html`. Design rendered at `http://localhost:8399/Atlas%20MVP.dc.html` (`python -m http.server 8399` in `design-import/`).
- Founder decisions (spec §Founder decisions): black rail locked, no theme/font experiment toggles; real data kept, stubs only Workspace/Agents; call view Dark default + Light toggle; build order Shell → Home → Calendar → Company → Call → Chat.
- Animations: keyframe values COPIED VERBATIM from design sources — never re-created from memory. All animation wrapped in `@media (prefers-reduced-motion: reduce)` guards (design head, line 25).
- Colors only via tokens — no ad-hoc hex in components. New-color additions must be appended to `agent-memory/cross-cutting.md` BEFORE the commit lands.
- Every UI string via i18n dictionaries (`src/lib/i18n/dictionaries/`), EN + HE. Numbers/timestamps/tickers: JetBrains Mono, tabular, `dir="ltr"` in both languages.
- Battery before every commit that ends a task: `npx tsc --noEmit` && `npm test` && (page tasks) verify-app side-by-side. `npm run build` at Tasks 3, 7, 9.
- UPDATED DESIGN NOTE: founder shipped a minor revision (chat icon + Ask Atlas icon aesthetics). Before Task 8, refresh `design-import/Atlas MVP.dc.html` (founder re-runs the import, or fetch `Atlas MVP.dc.html` from design project `a041c61d-6ab7-4c5c-bbb6-2033636e877c` via DesignSync get_file) and re-check the two icon SVGs against lines 60–61 (rail chat icon) and the ✦ Ask Atlas buttons (lines ~437, ~223).

---

### Task 1: Token + font foundation

**Files:**
- Modify: `src/lib/design/tokens.ts` (add V2 section at the bottom of `tokens`)
- Modify: `tailwind.config.ts:8-37` (colors) and `:38-63` (fontFamily)
- Modify: `src/app/layout.tsx` (add next/font loads)
- Test: `npx tsc --noEmit` + visual smoke (tokens render)

**Interfaces:**
- Produces Tailwind classes used by ALL later tasks: `bg-shell` (`#F5F3EE`), `bg-desktop` (existing `#E7E2DA`), `bg-rail` (`#111112`), `text-rail` (`#D6D4CF`), `bg-rail-chip` (`rgba(255,255,255,0.07)`), `border-rail-hair` (`rgba(255,255,255,0.09)`), `bg-rail-active` (`rgba(255,255,255,0.12)`), `bg-ask` (`#FCE44D`), `text-ask-ink` (`#1C1B19`), plus dark-call surfaces `bg-call-dark` (`#141414`), `bg-call-panel` (`#1D1D1D`), `text-call-ink` (`#EDEBE6`), `text-call-faint` (`#8F8D88`). Fonts: `font-display` (Newsreader), `font-mono-num` → JetBrains Mono.
- Exact rail values: verify against the computed styles of the rendered design (localhost:8399, DevTools on the `<aside>`) in step 2 and correct the hex values above to the design's real ones before committing.

- [ ] **Step 1: Read the design's token reality.** Open `http://localhost:8399/Atlas%20MVP.dc.html` in Chrome (MCP), run `javascript_tool`: `getComputedStyle(document.querySelector('aside')).backgroundColor` and the same for a nav button, the main div (`--main-bg`), a `Quick access` chip, and hairline borders. Record exact values.
- [ ] **Step 2: Add the V2 tokens** to `src/lib/design/tokens.ts` inside `tokens` (values from Step 1; the ones below are from the design HTML defaults and MUST be corrected if Step 1 differs):

```ts
  // ── V2 (Claude Design import, 2026-07) ──
  v2: {
    shell: '#F5F3EE',        // main page area ({{ mainBg }} default)
    rail: '#111112',         // black nav rail
    railText: '#D6D4CF',
    railActive: 'rgba(255,255,255,0.12)',
    railChip: 'rgba(255,255,255,0.07)',
    railHair: 'rgba(255,255,255,0.09)',
    ask: '#FCE44D',          // Ask-Atlas selection/highlight ONLY
    askInk: '#1C1B19',
    callDark: '#141414',     // call-view dark surfaces
    callPanel: '#1D1D1D',
    callInk: '#EDEBE6',
    callFaint: '#8F8D88',
  },
```

- [ ] **Step 3: Expose in `tailwind.config.ts`** — inside `colors` add: `shell: tokens.v2.shell, rail: tokens.v2.rail, 'rail-text': tokens.v2.railText, 'rail-active': tokens.v2.railActive, 'rail-chip': tokens.v2.railChip, 'rail-hair': tokens.v2.railHair, ask: tokens.v2.ask, 'ask-ink': tokens.v2.askInk, 'call-dark': tokens.v2.callDark, 'call-panel': tokens.v2.callPanel, 'call-ink': tokens.v2.callInk, 'call-faint': tokens.v2.callFaint`.
- [ ] **Step 4: Fonts.** In `src/app/layout.tsx` add next/font Google loads — `Newsreader` (`variable: '--font-newsreader'`, weights 400/500/600, latin) and `JetBrains_Mono` (`variable: '--font-jbmono'`, 400/500) — put both variables on `<html>`. In `tailwind.config.ts` `fontFamily` add: `display: ['var(--font-newsreader)', 'Georgia', 'serif']` and `'mono-num': ['var(--font-jbmono)', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace']`. (If a `font-mono-num` utility already exists in globals.css, replace its stack with the variable.)
- [ ] **Step 5: Cross-cutting append.** Append to `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md`: `[ts] Lane F: tailwind tokens EXTENDED (additive): shell/rail*/ask*/call* colors + font-display (Newsreader) + font-mono-num→JetBrains Mono. tokens.ts gained tokens.v2.`
- [ ] **Step 6: Verify + commit.** `npx tsc --noEmit` clean; boot `npm run dev -- -p 3001`, confirm app still renders unchanged (tokens are additive). `git commit -m "feat(ds): V2 design tokens + Newsreader/JetBrains Mono fonts"`.

### Task 2: Animation foundation

**Files:**
- Create: `public/atlas-anim.js` (verbatim copy of `design-import/atlas-anim.js`)
- Create: `src/components/ds/AnimCanvas.tsx`
- Create: `src/components/ds/LiveBeamAvatar.tsx`
- Modify: `src/app/globals.css` (append keyframes block)
- Test: `src/components/ds/__tests__/LiveBeamAvatar.test.tsx`

**Interfaces:**
- Produces `<AnimCanvas mode="buffer" secs={285} ink="dark"|"light" fill className />` — renders a `<canvas data-anim="buffer" …>` (or `data-field data-mode="globe|stream"`) and calls `window.AtlasAnim.scan()` on mount (script loaded once via next/script in the app layout, `strategy="lazyOnload"`).
- Produces `<LiveBeamAvatar size={44} surface="card"|"page"|"rail"> {children: avatar tile} </LiveBeamAvatar>` — wraps any avatar with the radar-beam: red ring + 3 staggered pulse rings + blinking dot.
- Produces global CSS keyframes: `atpulse`, `atline`, `atblink`, `atsettle` (design HTML lines 17–20, verbatim), `radar-pulse`, `dot-blink` (live-beam.html, verbatim), plus `.atscroll` scrollbar styles (lines 26–28) and `askSlideIn` for the Ask-Atlas panel (`transform: translateX(100%) → none`, 0.32s cubic-bezier(0.16,1,0.3,1); RTL variant `-100%`).

- [ ] **Step 1: Copy engine.** `cp design-import/atlas-anim.js public/atlas-anim.js` (verbatim, no edits). Load it in `src/app/app/layout.tsx` via `<Script src="/atlas-anim.js" strategy="lazyOnload" />`.
- [ ] **Step 2: Append to `src/app/globals.css`** (copy keyframe bodies EXACTLY from design HTML lines 17–31 and live-beam.html):

```css
/* ── Claude Design animation vocabulary (copied verbatim from design-import) ── */
@keyframes atpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.78)}}
@keyframes atline{from{transform:translateY(4px)}to{transform:none}}
@keyframes atblink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes atsettle{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes radar-pulse{0%{transform:scale(0.75);opacity:0.9}70%{opacity:0.15}100%{transform:scale(1.9);opacity:0}}
@keyframes dot-blink{0%,100%{opacity:1}50%{opacity:0.35}}
@keyframes askSlideIn{from{transform:translateX(100%)}to{transform:none}}
@keyframes askSlideInRtl{from{transform:translateX(-100%)}to{transform:none}}
.atscroll::-webkit-scrollbar{width:10px;height:10px}
.atscroll::-webkit-scrollbar-thumb{background:rgba(28,27,25,.13);border-radius:9px;border:3px solid transparent;background-clip:content-box}
.atscroll::-webkit-scrollbar-track{background:transparent}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;animation-iteration-count:1!important}}
```

- [ ] **Step 3: Write failing test** `src/components/ds/__tests__/LiveBeamAvatar.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { LiveBeamAvatar } from '../LiveBeamAvatar'

test('renders three staggered pulse rings, red ring and blinking dot around child', () => {
  const { container } = render(
    <LiveBeamAvatar size={44}><span data-testid="tile">ת</span></LiveBeamAvatar>
  )
  expect(container.querySelectorAll('[data-beam-ring]')).toHaveLength(3)
  expect(container.querySelector('[data-beam-dot]')).toBeTruthy()
  expect(container.textContent).toContain('ת')
})
```

- [ ] **Step 4: Run it, confirm FAIL** (`npm test -- LiveBeamAvatar`) with "Cannot find module '../LiveBeamAvatar'".
- [ ] **Step 5: Implement `LiveBeamAvatar.tsx`** (structure and timing from live-beam.html — ring 2px live-red, delays 1.8s/3.6s, 5.4s cubic-bezier(0.2,0.6,0.4,1); gap color = surface):

```tsx
'use client'
import { cn } from '@/lib/utils'

const SURFACE_BG = { card: 'bg-canvas', page: 'bg-shell', rail: 'bg-rail' } as const

/** Radar-beam LIVE indicator (design ref: design-import/reference/live-beam.html).
 *  Wraps an avatar tile with the red ring + 3 expanding pulse rings + blinking dot. */
export function LiveBeamAvatar({
  size = 44, surface = 'card', className, children,
}: {
  size?: number; surface?: keyof typeof SURFACE_BG; className?: string; children: React.ReactNode
}) {
  const ring = (delay: string) => (
    <span
      data-beam-ring
      className="pointer-events-none absolute inset-0 rounded-full border-2 border-live opacity-0"
      style={{ animation: `radar-pulse 5.4s cubic-bezier(0.2,0.6,0.4,1) infinite`, animationDelay: delay }}
    />
  )
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size * 1.2, height: size * 1.2 }}>
      {ring('0s')}{ring('1.8s')}{ring('3.6s')}
      <span className="relative z-[3] flex items-center justify-center rounded-full bg-live"
        style={{ width: size, height: size, padding: 2.5 }}>
        <span className={cn('flex h-full w-full items-center justify-center rounded-full', SURFACE_BG[surface])}
          style={{ padding: 3 }}>
          {children}
        </span>
      </span>
      <span data-beam-dot
        className={cn('absolute z-[4] rounded-full bg-live border-[3px]', surface === 'rail' ? 'border-rail' : surface === 'page' ? 'border-shell' : 'border-canvas')}
        style={{ width: size * 0.27, height: size * 0.27, bottom: size * 0.08, right: size * 0.08, animation: 'dot-blink 2.6s ease-in-out infinite' }}
      />
    </span>
  )
}
```

  Note: `border-live` etc. require live in border palette — it already is (`colors.live`).
- [ ] **Step 6: Implement `AnimCanvas.tsx`:**

```tsx
'use client'
import { useEffect, useRef } from 'react'

type Props = {
  mode: 'buffer' | 'desk' | 'globe' | 'stream'
  secs?: number; ink?: 'dark' | 'light'; fill?: boolean; className?: string
  /** extra data-* attrs passed straight to the engine (labels, count, spin, r, cycle, scatter, h) */
  opts?: Record<string, string | number>
}

/** Thin wrapper over design-import's atlas-anim engine (public/atlas-anim.js).
 *  The engine self-starts canvases via IntersectionObserver on AtlasAnim.scan(). */
export function AnimCanvas({ mode, secs, ink, fill, className, opts }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const w = window as unknown as { AtlasAnim?: { scan: () => void } }
    if (w.AtlasAnim) w.AtlasAnim.scan()
    else {
      const t = setInterval(() => { if (w.AtlasAnim) { w.AtlasAnim.scan(); clearInterval(t) } }, 200)
      return () => clearInterval(t)
    }
  }, [])
  const dataAttrs: Record<string, string> = {}
  if (mode === 'buffer' || mode === 'desk') dataAttrs['data-anim'] = mode
  else { dataAttrs['data-field'] = ''; dataAttrs['data-mode'] = mode }
  if (secs != null) dataAttrs['data-secs'] = String(secs)
  if (ink) dataAttrs['data-ink'] = ink
  if (fill != null) dataAttrs['data-fill'] = ''
  for (const [k, v] of Object.entries(opts ?? {})) dataAttrs[`data-${k}`] = String(v)
  return <canvas ref={ref} {...dataAttrs} className={className} />
}
```

- [ ] **Step 7: Tests pass + commit.** `npm test -- LiveBeamAvatar` PASS; `npx tsc --noEmit` clean. `git add -A && git commit -m "feat(ds): animation foundation — atlas-anim engine, AnimCanvas, LiveBeamAvatar, design keyframes"`.

### Task 3: Shell — black rail + Workspace/Agents stubs

**Files:**
- Modify: `src/components/app/NavRail.tsx` (rewrite to the black rail; design lines 38–89)
- Modify: `src/app/app/layout.tsx` + `src/components/app/MacWindowFrame.tsx` usage (shell goes full-bleed: rail flush left, main `bg-shell`; keep MacWindowFrame ONLY if the design's stone desktop frame survives — per rendered design it does NOT: the app fills the viewport. Remove the frame from `/app/*` layout, keep the component file for the login gateway if it uses it.)
- Create: `src/app/app/workspace/page.tsx`, `src/app/app/agents/page.tsx`
- Create: `src/lib/workspace/data.ts`, `src/lib/agents/data.ts`
- Modify: `src/lib/i18n/dictionaries/*` (nav.workspace, nav.agents, workspace.* / agents.* stub strings)
- Modify: `src/components/ds/icons.tsx` (add WorkspaceIcon — 4 rounded rects, design line 64; AgentsIcon — briefcase, line 67; chat sparkle already exists — re-check vs design line 61)
- Test: `src/lib/workspace/__tests__/data.test.ts`, `src/lib/agents/__tests__/data.test.ts`

**Interfaces:**
- Produces `getWorkspaces(): Promise<Workspace[]>` where `type Workspace = { id: string; name: string; subtitle: string; fileCount: number; updatedLabel: string; icon: string }` and `getAgentsPageData(): Promise<{ agents: AgentCard[]; scheduled: ScheduledAgent[]; finished: FinishedTask[] }>` with `AgentCard = { id: string; name: string; domain: string; description: string; status: 'idle'|'running' }`, `ScheduledAgent = { id: string; name: string; scheduleLabel: string }`, `FinishedTask = { id: string; title: string; meta: string }`. Stub contents copied from the design (Workspaces: Tigbur — privatization review · Qualitau — Q2 deep dive · Shipping sector scan; Agents: analyst/doc_reader, Earnings watch/Sector scan, Q1 transcript digest/Peer comparison).
- NavRail items become: Quick access ⌘K chip, Home, Calendar, Chat, Workspace, Agents; footer Profile, language toggle, collapse. Rail styling: `bg-rail`, wordmark `assets` SVG (copy `design-import/assets/atlas-wordmark.svg` + `atlas-A.svg` to `public/brand/`), active item `bg-rail-active` + white text, labels 14px, icons 18px stroke 1.6.

- [ ] **Step 1: Stub data TDD.** Write failing tests asserting `getWorkspaces()` returns 3 items with non-empty fields, `getAgentsPageData()` returns 2 agents + 2 scheduled + 2 finished. Run → FAIL (module not found).
- [ ] **Step 2: Implement both data modules** with the design's demo content; export the types. Tests PASS.
- [ ] **Step 3: Dictionaries.** Add `nav.workspace: 'Workspace'/'סביבת עבודה'`, `nav.agents: 'Agents'/'סוכנים'`, and the stub pages' strings (headline `Workspaces`, sub `Each workspace is one company analysis — its own files, agents, and history. Open one or start fresh.`, `New workspace`, `Name it and start adding files`; agents: `MY AGENTS`, `SCHEDULED AGENTS`, `FINISHED TASKS`, `Create an agent`, `Ready when you are.` + Hebrew equivalents).
- [ ] **Step 4: Rewrite NavRail** to the design (lines 38–89): black rail, wordmark img (collapsed → A mark), Quick-access chip with ⌘K kbd, the five nav buttons with the design's SVGs, footer (Profile, language toggle, collapse). Keep `usePathname` active logic and i18n. NO theme/font toggles (founder decision 1).
- [ ] **Step 5: Shell layout.** Update `src/app/app/layout.tsx`: full-viewport flex, NavRail flush left, main area `bg-shell` with `.atscroll` overflow. Remove MacWindowFrame wrapper from this layout only.
- [ ] **Step 6: Stub pages.** `workspace/page.tsx`: headline (font-display 28px), sub, grid of workspace cards (white `bg-canvas rounded-card shadow-card`, icon tile, mono `N files` + updated label, hover lift) + dashed `New workspace` card — data from `getWorkspaces()`. `agents/page.tsx`: black terminal strip at top (`> Ready when you are.` mono, bg-rail), `MY AGENTS` cards (mono `> analyst` + `● idle`), `SCHEDULED AGENTS` rows with mono date chips, `FINISHED TASKS` checked rows — data from `getAgentsPageData()`. Match design lines 750–800 (picker) / 1197–1316.
- [ ] **Step 7: Verify (verify-app).** Dev :3001 + design :8399 side-by-side screenshots: rail (expanded + collapsed), workspace page, agents page. EN + HE (RTL flip: rail on right). Console: zero errors. `npm run build` green.
- [ ] **Step 8: Commit** `feat(shell): black rail + workspace/agents stub pages behind data interfaces`.

### Task 4: Home

**Files:**
- Modify: `src/app/app/home/page.tsx`, `src/components/app/Greeting.tsx`, `TodayLine.tsx`, `HomeSearch.tsx`, `UpcomingCard.tsx`, `LiveNowPanel.tsx`, `CollapsiblePanel.tsx`
- Design: lines 94–166 (homeLive 102–118, homeNoLive 119+; upcoming rows ~130–165)

**Interfaces:**
- Consumes: `LiveBeamAvatar` (Task 2), tokens (Task 1). Data wiring unchanged: `listCalls({scope:'upcoming'})`, `LiveNowPanel` polling `/api/live/state`.

- [ ] **Step 1: Read design lines 94–166** + re-screenshot design home (live + no-live: use the demo "clear live" link at the panel bottom).
- [ ] **Step 2: Restyle hero** — mono TodayLine with sun icon, Greeting 28–30px bold, sub line `text-ink-muted`, search pill (`rounded-bubble shadow-float`, magnifier, placeholder from dict).
- [ ] **Step 3: Restyle upcoming list** — `UPCOMING INVESTOR CALLS` SectionHeader (11px mono letterspaced), rows: 40px rounded avatar tile with Hebrew initial `bg-subtle`, name semibold 15px, mono meta line, right mono date/time stack, gray relative chip (`bg-subtle rounded-md px-2 text-2xs mono`); row hover `bg-subtle` + `shadow-card` lift.
- [ ] **Step 4: LIVE NOW panel** — collapsible left panel titled mono `LIVE NOW`; card: `LiveBeamAvatar surface="card"` around the company tile, name + `Q2 2026 · Investor call` meta, red `● LIVE` label + mono elapsed clock. Wire to existing live state (company name, elapsed).
- [ ] **Step 5: Verify-app matrix** — side-by-side (design vs :3001): no-live EN, no-live HE, live EN (start `node scripts/live-broadcast.mjs` replay or stub the state briefly — claim :8788 in cross-cutting if engine started), hover state, beam GIF vs reference GIF. Console zero.
- [ ] **Step 6: Commit** `feat(home): Claude Design restyle — hero, upcoming rows, LIVE NOW beam panel`.

### Task 5: Calendar

**Files:**
- Modify: `src/app/app/calendar/page.tsx`, `src/components/calendar/CalendarView.tsx`
- Design: lines 167–215

**Interfaces:** Consumes tokens + `LiveBeamAvatar` (small, 20px, for live chips). Data wiring unchanged (existing calls feed).

- [ ] **Step 1: Read design lines 167–215** + design screenshots (All/My toggle states).
- [ ] **Step 2: Restyle** — `Calendar` display headline; `‹ June 2026 ›` mono month nav; segmented control (`All Investor Calls` active = black pill white text / `My Calendar`); affordance line right (`Drag a call into My Calendar to follow it`, text-ink-faint 12px); grid: mono weekday header row 11px letterspaced, hairline cells, mono day numbers, today = black filled circle white number; event chips: white rounded-md hairline border, tiny avatar tile, name 12px, right mono time — live chip gets red dot + `LIVE` mono red 10px.
- [ ] **Step 3: Keep behaviors** (existing follow/toggle logic if present; do not add drag if not built — visual affordance line only when `My Calendar` exists as a feature; otherwise show toggle wired to existing scope filter).
- [ ] **Step 4: Verify-app** — side-by-side month grid EN/HE (RTL: SUN..SAT flips), toggle states, live chip animation. Console zero.
- [ ] **Step 5: Commit** `feat(calendar): Claude Design restyle — mono grid, segmented toggle, live chips`.

### Task 6: Company + tabs

**Files:**
- Modify: `src/app/app/company/[id]/page.tsx`, `src/components/company/CompanyView.tsx`, `CompanyOverview.tsx`, `MyQuotes.tsx`, `QuoteCard.tsx`, `AddInvestorCall.tsx` (button style only)
- Design: lines 432–647 (OVERVIEW 468 · QUOTES 511 · REPORTS 561 · WEBINARS 598)

**Interfaces:** Consumes tokens. Data unchanged (`/api/companies/[id]`, quotes API, existing tabs state). New tab set: Overview / Quotes / Reports / Webinars — Reports/Webinars render design layout from whatever data exists; where no backend feed exists yet, render the section frame with an honest empty state (`No reports linked yet` via dict), NOT fake data (real-data rule).

- [ ] **Step 1: Read design lines 432–647** + 4 tab screenshots.
- [ ] **Step 2: Header** — `‹ Back to Home` breadcrumb, 44px logo tile, company name 26px bold, mono subline `Shipping · TASE 1105022` (sector · ticker from real data), actions right: black pill `+ Add investor call` (existing AddInvestorCall restyled), white hairline `✦ Ask Atlas` button (links to chat with @company prefilled — existing mention route).
- [ ] **Step 3: Tabs** — underline style (active ink underline 2px, inactive text-ink-muted), keys overview/quotes/reports/webinars via dict.
- [ ] **Step 4: Overview tab** — `MOST RECENT CALL` card (play circle, `Watch in playback`, mono duration, links to call view) + `NEXT SCHEDULED` card (calendar tile, mono date/time, `Upcoming · in ~N weeks` chip, `Remind me` ghost) from real calls data.
- [ ] **Step 5: Quotes tab** — folder chips row (`All quotes N` active black pill; folder names + counts; `+ New folder` ghost) over quarter-grouped collapsibles; quote cards: RTL Hebrew quote 15px, attribution row (avatar dot, speaker · role, mono `Q2 2026`), actions fade in on hover (`.atq` pattern → implement as `group`/`group-hover:opacity-100 transition-opacity duration-150`, actions: copy/share/folder icons). Keep existing quotes wiring + folders API.
- [ ] **Step 6: Reports + Webinars tabs** — Reports: legend line (`Each quarter: 📄 Transcript · 📄 Report PDF · 🖥 Slides` from dict), year-grouped rows, three icon-buttons per row (dashed ghost when artifact missing). Webinars: explainer line, rows (camera tile, Hebrew RTL title, mono `Investor update webinar · 48 min`, right mono date + `Transcript` pill). Wire both to whatever call/report data exists (webinar-type calls) or honest empties.
- [ ] **Step 7: Verify-app** — 4 tabs × EN/HE side-by-side vs design; quote hover GIF; console zero.
- [ ] **Step 8: Commit** `feat(company): Claude Design restyle — header, 4 tabs, hover quote actions`.

### Task 7: Call view (live + finished)

**Files:**
- Modify: `src/app/app/live/[id]/page.tsx`, `src/components/live/LiveTranscriptView.tsx`, `LiveBroadcastView.tsx`, `TranscriptBody.tsx`, `MediaPlayer.tsx`, `TranscriptSidePanel.tsx`
- Create: `src/components/live/CallThemeToggle.tsx` (Dark/Light, default Dark; theme via a `data-call-theme` attr + call-* tokens)
- Design: lines 216–431 + docked player 1318–1400

**Interfaces:** Consumes tokens, `AnimCanvas mode="buffer"`, keyframes `atsettle`/`atblink`/`atline`. Data unchanged: live `/api/live/state`+`/pcm`, finished transcripts API. Theme: `default Dark` (founder decision 3); Light = existing light tokens.

- [ ] **Step 1: Read design lines 216–431** + screenshots (dark single, light single, multi, sections sidebar).
- [ ] **Step 2: Frame** — top bar (company tile + Hebrew title + mono date · Dark/Light segmented toggle · `✦ Ask Atlas` · close), `‹ Back to Overview`, tabs Transcript/Slides/Report + `View Single|Multi` segmented right. Dark theme surfaces via `call-dark`/`call-panel`/`call-ink` tokens on a `data-call-theme="dark"` scope; Light reuses standard tokens.
- [ ] **Step 3: CALL SECTIONS sidebar** — mono timestamps + speaker names from transcript segments (existing section/speaker data), active section dot + karaoke vertical progress line (`atline` on updates).
- [ ] **Step 4: Transcript body** — RTL turns: speaker chip + name right, mono timestamp, text 15px/1.7; live: new lines animate `atsettle .3s ease-out`, karaoke caret `atblink`; active-turn vertical bar at the reading edge. Keep existing karaoke sync logic.
- [ ] **Step 5: Multi view** — 3-pane grid (Transcript | Slides | Report) with mono pane headers (`TRANSCRIPT · ● LIVE · karaoke`, `SLIDES ‹ שקופית 4 ›`, `REPORT PDF · read freely`); Slides/Report panes render real artifacts when Lane M lands them — until then the pane frame + honest empty (`Slides will appear here when linked`).
- [ ] **Step 6: Docked player** — charcoal pill (`bg-player rounded-pill shadow-player`): company tile, scrolling Hebrew title, red LIVE badge (live) / play-pause, progress track, mono clock, volume. Behind the live edge mount `AnimCanvas mode="buffer" fill ink={theme}` (design line 394). Keep existing audio wiring (PlayerProvider/LiveAudioProvider).
- [ ] **Step 7: Verify-app** — matrix: finished call light+dark, live call (replay engine; claim :8788 in cross-cutting first) dark, single+multi, EN+HE chrome, GIFs: settle/caret/buffer vs design. `npm run build` green. Console zero.
- [ ] **Step 8: Commit** `feat(call): Claude Design restyle — dark-first call view, sections rail, multi view, charcoal player + buffer anim`.

### Task 8: Chat + Ask Atlas

**Files:**
- Modify: `src/app/app/chat/page.tsx`, `src/components/chat/ChatView.tsx`, `ChatHistory.tsx`, `ChatComposer.tsx`, `Markdown.tsx`, `CitationPopover.tsx`, `ThinkingDots.tsx`
- Modify: `src/components/live/TranscriptChatPanel.tsx` (Ask-Atlas in-call panel: right slide-in)
- Design: chat 648–749; in-call chat 404–431; ask-highlight rules lines 21–24
- REFRESH FIRST: updated design (chat icon + Ask Atlas icon) — see Global Constraints.

**Interfaces:** Consumes tokens, keyframes `askSlideIn`. Data unchanged: `/api/chat`, `/api/conversations`, mentions.

- [ ] **Step 1: Refresh design file** (founder re-import or DesignSync fetch); diff old vs new; apply the two icon SVGs everywhere they appear (rail chat item, Ask Atlas buttons, chat panel title).
- [ ] **Step 2: Chat page** — left mini-nav column (`New chat`·`Projects`·`Workspace`·`Agents` links + `RECENT CHATS` list, mixed RTL/LTR titles auto-dir) on `bg-panel`; empty state hero (`Good morning` display, sub, composer card `rounded-bubble shadow-float` with `+` `@` `/` affordances + black circular send); helper line `Type / for commands, @ to mention a company`.
- [ ] **Step 3: Conversation state** — user message = charcoal pill right-aligned (`bg-player text-player-ink rounded-bubble`, auto-dir for Hebrew), assistant = plain ink on shell, numbered points mono (`01`), citation chip (white hairline pill: red live-dot when live source, RTL call title, mono timestamp) → deep-links to call view at timestamp (existing citation route). Composer docks bottom. Keep streaming/typewriter/thinking behaviors.
- [ ] **Step 4: Ask-Atlas in-call panel** — `TranscriptChatPanel` becomes the design's right panel (lines 404–431): slides in `askSlideIn 0.32s cubic-bezier(0.16,1,0.3,1)` (RTL variant when `dir==='rtl'`), header `✦ Chat`, explainer `Ask anything about the excerpt you highlighted — the audio keeps playing.`; transcript selection inside `[data-ask]` scope gets `::selection` ask-yellow (globals.css: `[data-ask] ::selection{background:#FCE44D;color:#1C1B19}` — token value) and on mouseup becomes an excerpt chip above the composer (speaker attribution + dismiss ×). Audio must not pause on open (assert existing behavior).
- [ ] **Step 5: Verify-app** — chat empty+conversation EN/HE, citation chip → call deep-link click-through, ask panel: open GIF (slide from right; from LEFT in RTL), selection-yellow screenshot, excerpt chip flow, audio-keeps-playing check (player clock advances while panel open). Console zero.
- [ ] **Step 6: Commit** `feat(chat): Claude Design restyle — chat page, charcoal bubbles, citation chips, Ask-Atlas slide-in with yellow selection`.

### Task 9: Final sweep + ship

**Files:** touched-only fixes; `PROGRESS.md`; board/state files.

- [ ] **Step 1: Full matrix re-verify** — every page EN+HE at 1440×900 and 1280×800, design side-by-side, zero console errors anywhere; run existing full `npm test`; `npx tsc --noEmit`; `npm run build`.
- [ ] **Step 2: Lessons + docs** — update `ARCHITECTURE.md` (new components: AnimCanvas, LiveBeamAvatar, CallThemeToggle, workspace/agents data modules; shell change), append lessons to `agent-memory/state-frontend.md`.
- [ ] **Step 3: /ship** — battery via the ship skill → append to `agent-memory/ready-queue.md` (lane rule: no main push), `PROGRESS.md` entry, update board Lane F section.
- [ ] **Step 4: Report to founder** — one message: what shipped, verification evidence (screenshot pairs), known gaps (Slides/Report empties awaiting Lane M, webinars feed, updated-icon confirmation).
