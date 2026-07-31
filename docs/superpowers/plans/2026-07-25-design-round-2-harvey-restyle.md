# Design Round 2 — Harvey Restyle Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md
> + PROGRESS.md. Merged to main 2026-08-01 (`e977823`) after one reviewer fix round.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin every existing surface to the new design's Harvey aesthetic (black rail / white background / gray panels), import the new Ask Atlas panel + composer-scissors Pinge entry point, delete the theme cycle.

**Architecture:** One probe harness (browser JS snippet, run via Chrome MCP against the locally-served design AND the app) produces a committed token report; `tokens.ts`/`tailwind.config.ts`/`globals.css` are rewritten from it; components are then restyled surface-by-surface consuming only tokens; the same harness re-run against the app is the automated parity check.

**Tech Stack:** Next.js 14 App Router, Tailwind (token-driven config), Chrome MCP for probing/verification, existing Vitest suite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-design-round-2-harvey-import-design.md` (founder-approved 2026-07-25).
- Parity source = the RENDERED design in **Harvey mode** at `http://127.0.0.1:4321/` (scratchpad server serving `design-import/`); never the design's bundle CSS (rules/app.md). Verify theme label reads exactly `Theme · Harvey` before every probe run.
- Aesthetic-only: NO functional/data/API changes. Workspace/Agents stubs, `/print/[id]`, auth gateway untouched.
- Pinge behavior (chips, 4-max, oversize toast, visibility rules) unchanged; only styling + the new second entry point.
- RTL: Hebrew `dir="rtl"`; numbers/tickers `font-mono-num` + `dir="ltr"` (CLAUDE.md iron rule 5).
- No ad-hoc hex/radius/shadow inline in components — everything through tokens (tokens.ts header law).
- Battery before reveal: `npm test` (104 passing at branch start) · `npx tsc --noEmit` · `npm run build` · console-clean · bidi eyeball.
- Dev server: port 3001 (Lane F). Design server: 4321. Never touch 3000/3002/3003/:8788.
- Commit per task; branch `feat/design-round-2`.

**Probed Harvey anchor values (from the rendered design, 2026-07-25 session):**

| Key | Value |
|---|---|
| page background | `#FAFAFA` |
| panel/composer fill | `#F0F0F0` |
| raised input fill (search) | `#F7F7F7` |
| hairline/border | `#DEDEDE` (1px solid) |
| rail | `#0A0A0A`, 230px, border-right `1px solid rgba(255,255,255,0.09)` |
| ink | `#0A0A0A` · muted `#575757` |
| radius: panels/inputs | `12px` · pills `999px` |
| headline | `Newsreader, Georgia, serif` 500, 42px, letter-spacing −0.84px |
| body/UI | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif` |
| section label / pill font-size | 12.5px |
| Ask Atlas panel width | ~347px at 1920 viewport (re-probe exact + responsive rule in Task 1) |
| live accent | keep `#CB4B2E` unless Task 1 probe disagrees |

---

### Task 1: Probe harness + committed Harvey token report

**Files:**
- Create: `docs/evidence/feat-design-round-2/probe/probe-harvey.js`
- Create: `docs/evidence/feat-design-round-2/probe/harvey-design-tokens.json` (output, committed)

**Interfaces:**
- Produces: `harvey-design-tokens.json` — flat `{key: value}` map consumed by Tasks 2–7 as the value source, and re-produced from the app in Task 8 for the diff.

- [ ] **Step 1: Write the probe snippet**

`probe-harvey.js` (runs in the browser console / Chrome MCP `javascript_tool` on EITHER the design or the app; `ANCHORS` picks per-origin element anchors, keys are shared):

```js
// Harvey token probe — run on http://127.0.0.1:4321/ (design) or http://localhost:3001 (app).
// On the design: verify the rail toggle reads exactly "Theme · Harvey" first.
// Collect from BOTH the Home view and the call view (navigate, run, merge).
(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const pick = (el, props) => {
    const c = cs(el); if (!c) return null;
    return Object.fromEntries(props.map((p) => [p, c[p]]));
  };
  const leaf = (txt) => [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim().startsWith(txt)).pop();
  const shadowAncestor = (el) => {
    while (el && cs(el).boxShadow === 'none' && cs(el).border.startsWith('0px')) el = el.parentElement;
    return el;
  };
  const rail = [...document.querySelectorAll('*')].find((e) => {
    const r = e.getBoundingClientRect();
    return r.left <= 2 && r.width > 120 && r.width < 320 && r.height > innerHeight * 0.9
      && cs(e).backgroundColor !== 'rgba(0, 0, 0, 0)';
  });
  const composer = [...document.querySelectorAll('textarea, input')]
    .find((e) => (e.placeholder || '').startsWith('Ask Atlas'));
  const out = {
    pageBg: cs(document.body).backgroundColor,
    rail: pick(rail, ['backgroundColor', 'width', 'borderRight']),
    railItemActive: pick(leaf('Home')?.closest('[class]'), ['backgroundColor', 'color', 'borderRadius', 'fontSize', 'fontFamily']),
    headline: pick(leaf('Good morning'), ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color']),
    bodyText: pick(leaf('Write a company name'), ['fontFamily', 'fontSize', 'color']),
    sectionLabel: pick(leaf('UPCOMING INVESTOR CALLS'), ['fontFamily', 'fontSize', 'letterSpacing', 'color', 'fontWeight']),
    searchBox: pick(shadowAncestor([...document.querySelectorAll('input')].find((i) => (i.placeholder || '').includes('Search'))), ['backgroundColor', 'border', 'borderRadius', 'boxShadow', 'height']),
    listCard: pick(shadowAncestor(leaf('Tigbur Group')), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    // call view keys (null on Home — merge two runs):
    paneCard: pick(shadowAncestor(leaf('TRANSCRIPT')), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    viewPill: pick(leaf('Transcript')?.closest('button') || leaf('Transcript'), ['backgroundColor', 'border', 'borderRadius', 'fontSize', 'fontFamily', 'color']),
    askPanel: composer ? { width: composer.closest('[class]').getBoundingClientRect().width, panelWidthVsViewport: (composer.closest('[class]').getBoundingClientRect().width / innerWidth).toFixed(3) } : null,
    composerBox: pick(composer && shadowAncestor(composer), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    player: pick([...document.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); const bg = cs(e).backgroundColor.match(/\d+/g); return r.top > innerHeight * 0.75 && r.width > 400 && r.height > 30 && r.height < 90 && bg && +bg[0] < 45; }).pop(), ['backgroundColor', 'borderRadius', 'height']),
    liveAccent: pick(leaf('LIVE'), ['color']),
  };
  return JSON.stringify(out, null, 2);
})();
```

- [ ] **Step 2: Run it on the design — Home view** (`:4321`, Harvey mode verified) via Chrome MCP `javascript_tool`; save output.
- [ ] **Step 3: Run it on the design — call view** (enter Tigbur live → Multi → Ask Atlas open); merge the call-view keys into the same JSON.
- [ ] **Step 4: Extend the snippet for any key that returned `null`** (adjust the anchor, not the key), re-run until every key has a value. Write the merged result to `harvey-design-tokens.json`.
- [ ] **Step 5: Sanity-check against the anchor table in Global Constraints** — any disagreement means the design was NOT in Harvey mode; re-verify and re-run.
- [ ] **Step 6: Commit**

```bash
git add docs/evidence/feat-design-round-2/probe/
git commit -m "test(design-round-2): Harvey probe harness + design token report"
```

### Task 2: Token layer rewrite

**Files:**
- Modify: `src/lib/design/tokens.ts`
- Modify: `tailwind.config.ts` (only where token names change)
- Test: existing suite (`npm test`) + `npx tsc --noEmit`

**Interfaces:**
- Consumes: `harvey-design-tokens.json` (Task 1).
- Produces: `tokens.harvey` namespace + updated base tokens; the names below are what Tasks 4–7 reference: `harvey.page`, `harvey.panel`, `harvey.raised`, `harvey.hairline`, `harvey.ink`, `harvey.inkMuted`, `harvey.rail`, `harvey.railHair`, `harvey.player` (aliases `color.player`), `radius.panel` (12px), `radius.pill` (existing), `font.head` (Newsreader stack), `font.sans` (SF Pro Text stack).

- [ ] **Step 1: Rewrite `tokens.ts`**: replace the `v2` warm-shell family (`shell #F5F3EE`, `paper #FAF9F6`, `field #F3EEE4`, `fieldLine #E4DED1`, `chipBg #FBFAF7`, `sendIdle #E4DDCE`) with the Harvey values from the report (page `#FAFAFA`, panel `#F0F0F0`, raised `#F7F7F7`, hairline `#DEDEDE`); DELETE the `callDark`…`callFaint` dark-call family (spec decision 3); keep `rail`/`railText`/`railActive`/`railChip`/`railHair`, `live #CB4B2E` (or probe value), player family. Update the header comment to name Harvey as the single theme and cite the spec.
- [ ] **Step 2: `npx tsc --noEmit`** — every consumer of a deleted token surfaces as a type error; fix each by switching to the Harvey token that the surface's Task (4–7) prescribes — for call-view dark tokens, that is the light equivalents (`page`/`panel`/`ink`). Do not leave any consumer on a deleted name.
- [ ] **Step 3: `npm test`** — expected: suite passes (tests are behavioral, not color assertions); fix any that asserted removed token names.
- [ ] **Step 4: Commit** `git commit -am "feat(design-round-2): Harvey token layer — single light theme, dark-call family removed"`

### Task 3: Theme-cycle removal

**Files:**
- Modify: `src/components/app/NavRail.tsx` (drop `Scheme` state, toggle button, localStorage)
- Modify: `src/app/globals.css` (drop all `[data-scheme=…]` variable blocks; hard-set Harvey values in `:root`)
- Modify: `src/lib/i18n/dictionaries/en.ts`, `he.ts` (drop `themeWarm`/theme labels)
- Test: existing suite + manual

**Interfaces:**
- Produces: single `:root` CSS variable set (Harvey); NO `data-scheme` attribute anywhere.

- [ ] **Step 1:** Remove the scheme state/effect/labels/button from `NavRail.tsx`; add a one-time cleanup in the remaining mount effect: `delete document.documentElement.dataset.scheme; window.localStorage.removeItem('atlas-scheme')` (stale browsers otherwise keep a dead attribute).
- [ ] **Step 2:** In `globals.css`, inline the Harvey values into `:root` and delete every `[data-scheme]` block. Grep-check: `rg "data-scheme|atlas-scheme" src` → only the cleanup line from Step 1 remains.
- [ ] **Step 3:** Remove theme dictionary keys; `npx tsc --noEmit` catches any remaining consumer.
- [ ] **Step 4:** Run `npm test`; then eyes-on (:3001): rail shows NO theme button; app renders Harvey values.
- [ ] **Step 5: Commit** `git commit -am "feat(design-round-2): remove theme cycle — Harvey is the app"`

### Task 4: Shell + Home + Calendar restyle

**Files:**
- Modify: `src/components/app/{NavRail,ShellChrome,MacWindowFrame,Greeting,HomeSearch,UpcomingCard,LiveNowPanel,TodayLine,GlobalLiveBar}.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/components/ds/{SectionHeader,Tabs,EntityRow,SelectableRow,Surface,Avatar}.tsx` as consumers of changed tokens

**Interfaces:**
- Consumes: Task 2 token names only.

- [ ] **Step 1:** Restyle the shell backdrop chain (desktop/window frame) to flat `harvey.page` — the design has no marble desktop behind a floating window in Harvey; confirm against the rendered design (Home, 1440+ viewport) before deleting the frame treatment, and keep the component file (frame may still carry layout).
- [ ] **Step 2:** Home: greeting (Newsreader 42/500/−0.84), search box (`raised` fill, `hairline` border, 12px, 52px height), upcoming-calls card + rows, LIVE NOW column per probe report values.
- [ ] **Step 3:** Calendar: same card/row/label treatment (no structural change).
- [ ] **Step 4:** Bidi check: switch locale to Hebrew, eyeball Home + Calendar (numbers/tickers LTR mono).
- [ ] **Step 5:** `npm test` + `npx tsc --noEmit`; screenshot design-vs-app Home side by side into `docs/evidence/feat-design-round-2/`.
- [ ] **Step 6: Commit** `git commit -am "feat(design-round-2): shell + Home + Calendar in Harvey"`

### Task 5: Chat + Company restyle

**Files:**
- Modify: `src/components/chat/{ChatView,ChatHistory,ChatComposer,CitationPopover,MentionDropdown,Markdown}.tsx`
- Modify: `src/components/company/{CompanyView,CompanyOverview,MyQuotes,QuoteCard,AddInvestorCall}.tsx`

**Interfaces:**
- Consumes: Task 2 token names. ChatComposer geometry changes here are shared with Task 7's panel composer (same component) — Task 7 only ADDS the scissors button.

- [ ] **Step 1:** Chat page: composer field goes from the warm field family to Harvey panel gray (`panel` fill, `hairline` border, 12px), send button black circle per probe `composerBox`/design; history bubbles/cards to `panel`/`raised`.
- [ ] **Step 2:** Company: overview cards, quotes cards, tabs to Harvey values; stub-fed extras keep their demo markers untouched (rules/app.md).
- [ ] **Step 3:** Bidi eyeball both pages in Hebrew.
- [ ] **Step 4:** `npm test` + `npx tsc --noEmit`; side-by-side screenshots into evidence dir.
- [ ] **Step 5: Commit** `git commit -am "feat(design-round-2): Chat + Company in Harvey"`

### Task 6: Call views go light (live + finished + countdown + multiview floats)

**Files:**
- Modify: `src/components/live/{LiveTranscriptView,LiveBroadcastView,TranscriptBody,TranscriptSidePanel,FacetPanes,MediaPlayer,PdfViewer}.tsx`
- Modify: `src/app/app/live/[id]/` page wrappers if they set dark backgrounds

**Interfaces:**
- Consumes: Task 2 tokens. MediaPlayer keeps `color.player` black (spec decision 3).
- Produces: light call chrome that Task 7's panel sits beside.

- [ ] **Step 1:** Root call background dark→`harvey.page`; transcript text/labels to ink scale; sections rail (TranscriptSidePanel) to light treatment per design call view.
- [ ] **Step 2:** Multiview: each pane (Transcript/Slides/Report) becomes a floating white card (probe `paneCard` values — bg/border/radius/shadow exactly as probed), floating pill row per `viewPill`; pane add/remove behavior untouched.
- [ ] **Step 3:** Countdown (pre-live) view: white background, ring + copy per design ("EST. LIVE IN", broadcast-delay note, Enter live now button).
- [ ] **Step 4:** PdfViewer chrome: only surrounding chrome recolors; the pdf.js layer + its CSS cluster is NOT touched (rules/app.md pdf.js law).
- [ ] **Step 5:** Karaoke/live states: LIVE accent stays `live` token only; verify with the replay engine if a live check is needed (claim :8788 in cross-cutting first, release after — live.md).
- [ ] **Step 6:** Bidi eyeball on the Tigbur Q1 real call (`PyuMxe88e8g_live`); `npm test` + `tsc`; side-by-sides into evidence.
- [ ] **Step 7: Commit** `git commit -am "feat(design-round-2): call views light — Harvey floats for multiview"`

### Task 7: Ask Atlas panel + composer scissors (second Pinge entry point)

**Files:**
- Modify: `src/components/live/TranscriptChatPanel.tsx` (width, corners, empty state, follow-live caption)
- Modify: `src/components/chat/ChatComposer.tsx` (scissors button)
- Test: `src/components/live/__tests__/` or colocated test file matching repo pattern (find with `rg "describe\(" src -l --glob "*[Cc]hat*"`) — new test for the scissors-arm wiring

**Interfaces:**
- Consumes: the EXISTING snip-arming mechanism — locate it: `rg "snip|scissors" src/components/live/FacetPanes.tsx src/components/live/PdfViewer.tsx -n`. The Report-pane scissors sets an armed state; the composer button must call the same setter, not a copy.
- Produces: `ChatComposer` prop `onArmSnip?: () => void` — rendered as a scissors icon button left of the input when the prop is present; panel passes it only when a snippable document pane is open (matches current visibility rules).

- [ ] **Step 1: Write the failing test** — `ChatComposer` renders a scissors button when `onArmSnip` is passed and calls it on click; does NOT render it when the prop is absent:

```tsx
it('renders scissors and arms snip when onArmSnip provided', async () => {
  const arm = vi.fn()
  render(<ChatComposer {...requiredProps} onArmSnip={arm} />)
  const btn = screen.getByRole('button', { name: /snip|צילום|גזירה/i })
  await userEvent.click(btn)
  expect(arm).toHaveBeenCalledOnce()
})
it('no scissors without onArmSnip', () => {
  render(<ChatComposer {...requiredProps} />)
  expect(screen.queryByRole('button', { name: /snip|צילום|גזירה/i })).toBeNull()
})
```

(Adapt `requiredProps` + i18n label from the real component; label goes in both dictionaries.)

- [ ] **Step 2:** Run: `npm test -- ChatComposer` — expected FAIL (prop doesn't exist).
- [ ] **Step 3:** Implement: add the prop + icon button (reuse the existing scissors icon from the Report pane / `ds/icons.tsx`), positioned start-of-composer per design zoom (scissors bottom-left, tuner/mic/send right); wire `TranscriptChatPanel` to pass the same arm function the Report-pane button uses.
- [ ] **Step 4:** Run: `npm test -- ChatComposer` — expected PASS; full `npm test` stays green.
- [ ] **Step 5:** Panel restyle: width per probe `askPanel` (implement as the design's proportion, min/max-clamped), corner geometry per `composerBox`/panel probes, "Ask anything about this call" empty state + "Atlas is following this call live" caption (both locales), Report-pane scissors untouched.
- [ ] **Step 6:** Eyes-on e2e (:3001, real Tigbur call): arm from composer → drag on Report pane → chip appears → send → answer streams. Both locales. Screenshot into evidence.
- [ ] **Step 7: Commit** `git commit -am "feat(design-round-2): Ask Atlas panel Harvey geometry + composer scissors entry point"`

### Task 8: Full sweep, battery, parity diff, evidence

**Files:**
- Create: `docs/evidence/feat-design-round-2/2026-07-XX-harvey-verification.md`
- Create: `docs/evidence/feat-design-round-2/probe/harvey-app-tokens.json`

- [ ] **Step 1:** Re-run the Task 1 probe **against the app** (:3001, Home + call view) → `harvey-app-tokens.json`; diff vs `harvey-design-tokens.json`; every mismatch is a fix or a documented, justified deviation in the evidence file. This is the automated self-check.
- [ ] **Step 2:** /verify-app route sweep, eyes-on both locales: `/app/home`, `/app/calendar`, `/app/chat`, `/app/company/[id]`, `/app/live/[id]` (finished multi + single), pre-live countdown, settings. Console clean on each.
- [ ] **Step 3:** Battery: `npm test` · `npx tsc --noEmit` · `npm run build` — paste outputs into the evidence file (counts from output, never hand-typed).
- [ ] **Step 4:** Evidence doc: side-by-side design/app screenshots per surface + probe diff table + battery outputs. Commit.
- [ ] **Step 5:** Update board Lane F section + append ready-for-reveal note; founder big reveal; after founder verdict → `/ship`.

## Self-Review (done at write time)

- Spec coverage: decisions 1–5 → Tasks 2/3 (theme), 6 (light calls), 7 (Pinge both entry points), 8 (reveal); untouched-list enforced by task file lists. ✓
- Placeholders: values not yet probeable are bound to the Task 1 committed report by exact key name — no TBDs. ✓
- Type consistency: token names defined in Task 2 Interfaces are the only ones referenced by Tasks 4–7. `onArmSnip` defined once (Task 7). ✓
