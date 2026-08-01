# Evidence — three-surfaces import (Projects · Workspace · Agents), 2026-08-01

Lane F · branch `feat/surfaces-import` · port 3001 · design source
`design-import/Atlas MVP.dc.html` (409,413 bytes, imported this session).

**How to read this file.** Every caption below describes what is *in the frame*, and
says what the artifact does **not** show. That discipline is here because this lane lost
a whole review round on 2026-07-31 to an evidence file that claimed a panel was visible
in a screenshot where it was closed.

## Battery

| Check | Result |
|---|---|
| `npm test` | **160/160** on the current tip (108 before this chapter → 132 with this branch's 24 → 149 with the gate's 17 → 152 with 3 agent-seed tests in the founder rounds → 158 with the round-2 export-marker tests → 160 with the round-3 bidi tests) |
| `npx tsc --noEmit` | green |
| `npm run build` | green (see §6) |
| Console errors, EN | **0** across 11 surfaces, measured at the 149-test tip |
| Console errors, HE | **0** across 11 surfaces, measured at the 149-test tip |

Console counts come from Playwright listeners on `console[type=error]` and `pageerror`
across every captured route, not from a spot check. They were taken at the original capture
run and have **not** been re-measured across all 11 surfaces since; the screens touched in the
founder and review rounds were re-checked individually.

## 1. What was built

All three surfaces at full fidelity, per the founder's call to import everything in the
design rather than the headline state of each (spec §1).

- **Projects** (design 1099-1258) — list, a project, new-project, and the right rail
  (Instructions / Memory / Context with the capacity meter).
- **Workspace** (design 1263-2084) — picker with sort + both empty states, the intake
  sequence, the control shell (panel, sections, detail column, collapsed rail, tab bar),
  the working document, legal due-diligence, and split docs with drag gutters.
- **Agents** (design 2085-2365) — command deck, grid with per-card menu, finished tasks,
  scheduled, create-agent, and the dock (profile + chat).

## 2. Screenshots

All captured at 1440×900 via Playwright — real committed files, because Chrome MCP
screenshots expire with the transcript (the 07-31 lesson).

> **Capture context — read this before citing the PNGs.** The 22 Playwright captures were
> taken **before `origin/main`'s `/app/*` login gate was merged into this branch**, from an
> unauthenticated browser. They are accurate as to layout, locale and demo marking, and
> nothing about the surfaces changed in the merge — but they can no longer be reproduced
> unauthenticated, because every one of these routes now 307s to the login page.
>
> Post-merge verification of the gate is recorded in §9, and
> `authed-workspace-shell-post-gate.jpg` is the workspace shell captured **after** the
> merge through a genuinely signed-in session. That single JPG is the only artifact here
> that proves the post-gate authed path; the PNGs do not.

| File | What IS in the frame | What it does NOT show |
|---|---|---|
| `projects-list-{en,he}.png` | Demo banner, 3 seeded projects + a session-created one, New-project tile | Not the project detail |
| `project-detail-{en,he}.png` | Shipping sector: composer with "3 sources in context", RECENTS 4, and the rail — Instructions, Memory with "Only you", Context at 14% with 3 kind-badged cards | Editing states are closed; the Save/Cancel buttons are not visible |
| `agents-page-{en,he}.png` | Command deck, 2 agents, create tile, 2 finished tasks, 2 scheduled | The card menu is CLOSED; the dock is not open |
| `agents-dock-{en,he}.png` | The dock open on `analyst`'s **chat** tab: lead line + 3 findings, each with its `src` and a DEMO marker | The profile tab is not shown |
| `agents-create-{en,he}.png` | The create modal over the page: name, task + hint, the 4 scope buttons, workspace targets | Submit is DISABLED here (empty form) — the enabled state is not in frame |
| `workspace-picker-{en,he}.png` | 3 workspace cards, search, sort control | Sort menu CLOSED; empty states not shown |
| `workspace-shell-{en,he}.png` | Floating panel (Your Work + 4 sections with counts 6/2/10/5) and the main card with one file tab | Detail column closed; document and legal tabs not open |
| `workspace-document-{en,he}.png` | The document tab: toolbar, "Continue this section", Export, title, "3 citations DEMO", and formatted body incl. the marked citation block | The Export menu is CLOSED |
| `workspace-legal-{en,he}.png` | The `Legal review` tab after a full run: scope line + **6 findings**, each with a severity pill and a DEMO marker | The scoping and running stages are past; they are not in frame |
| `workspace-detail-files-{en,he}.png` | The Files detail column: 6 files with kind badges and open/close affordances | Other three detail bodies not shown |
| `workspace-intake-{en,he}.png` | A newly created workspace at the **intro** stage | Clarify and building stages are not in frame |

> ⚠️ **THESE PNGs PREDATE THE TWO FIX ROUNDS — they picture states that no longer ship.**
> Filed by the re-gate and true: no screenshot was re-captured after the fixes, so
> `workspace-document-{en,he}.png` still shows **"✓ Saved just now"** and the old inline English
> marker, and `workspace-intake-he.png` still shows the mono/reversed build line. The captions
> above describe what each image *contains*, not what currently ships. The fixes for defects 1, 2
> and 4 were verified eyes-on and by code inspection (and, for the export regression, by a real
> `page.pdf()` extraction), **but not re-photographed** — so for those three, treat the code and
> §4b as the record and these images as historical. Re-capturing them is carried, not claimed.

## 3. Demo marking audit

The binding rule (spec §2.1): if a screen shows a number, a quote or a finding that no
backend produced, it carries a visible marker in both locales.

| Surface | Page banner | Inline markers |
|---|---|---|
| Projects list | ✅ EN + HE | — |
| A project | ✅ EN + HE | — |
| Agents page | ✅ EN + HE | — |
| Agent dock | ✅ (page) | ✅ every finding row |
| Workspace picker | ✅ EN + HE | — |
| Workspace shell | ✅ EN + HE | ✅ file preview |
| Working document | ✅ EN + HE | ✅ citations line + a non-deletable notice above the body + a localized marker inside the `<cite>` |
| Legal findings | ✅ EN + HE | ✅ all 6 findings |
| Intake (building) | ✅ EN + HE | ✅ "nothing is actually being fetched" |

The most dangerous single element in this design is the working document's quote block:
a fabricated Hebrew quote attributed to a **named executive of a real TASE issuer**, with
a filing-shaped citation.

> **CORRECTED 2026-08-01 (supervisor, round-2 re-gate).** This paragraph previously said the
> attribution line ends `— DEMO, invented quote`. That English suffix was **deleted** in
> `1226933` and this section was not updated, so the record contradicted both the code and §4c
> of this same file. It now carries **two** markers, and it needs both:
> 1. a non-deletable localized notice rendered **outside** `contentEditable`, above the body;
> 2. a **localized** marker inside the `<cite>` itself, built from the dictionary.
>
> Neither is sufficient alone, and both failure modes were observed, not theorised. Inside-only
> was English-hardcoded (invisible to a Hebrew reader) and user-deletable. Outside-only sits at
> the top of a scrolling pane, so anything capturing just the quote leaves it behind — the
> re-gate reproduced exactly that with a real Chromium `page.pdf()` and got the quote, its cite
> line, and no marker at all. Export as PDF is now disabled outright (see §8).

## 4. What verification caught (fixed before review, not after)

1. **The float shadow was missing entirely.** An arbitrary Tailwind class with multi-layer
   `rgba()` compiled to nothing, so the workspace panel and main card had no lift at all.
   Replaced with the existing `shadow.pane` token, which is byte-identical to the design
   recipe. Three more menu/modal shadows were tokenized the same way
   (`shadow.menu` / `shadow.modal` / `shadow.hairlift` added).
2. **Panel width 312 → 290px**, the probed design value.
3. **"Actions taken" read 8 where the design shows 10** — the design prepends the
   workspace's own actions to the current session. Added `workspaceSessions()`.
4. **The document body was unstyled**: Tailwind preflight strips `h2`/`ul`/`blockquote`,
   which is exactly what `execCommand` emits. Added the scoped `.atlas-doc` cluster.
5. **Two bidi defects in Projects**: context meta ("4 sheets") inherited RTL and read
   "sheets 4" (now `<bdi dir="ltr">`); the Hebrew composer placeholder glued to a Latin
   project name (maqaf added).
6. **Three headlines were on the wrong stack** — see §5.
7. A stray English sentence was rendering inside the Hebrew file preview.
8. `"1 files"` → `"1 file"` in the agent target list.

## 4b. Founder round 2 — 2026-08-01 afternoon (commits `634fe0a`, `65a6235`, `597e4c2`)

The founder walked the three surfaces, then re-cut the design. `Atlas MVP.dc.html`
was edited remotely at **11:18Z** (version `1785587677358929`), after the 03:23
local import. Four changes came out of that:

| Ask | What shipped |
|---|---|
| Workspaces headline in serif | `font-display`. This **closes the founder call in §5** — see below. |
| A new workspace showed two composers | The bottom bar is gated to the *clarify* stage. Intro shows only the centred composer, exactly as the design does. |
| New agent-chat aesthetic, "copy it one for one" | `AgentDock` rebuilt: segmented tabs with the active half solid ink, sparkle header, snip/tools/mic composer row, helper line, live suggestion chips, "Recent agent chats", and Widen taking the whole main area. Scopes became Call / Workspace / **Sector** / Report. |
| Pill composer after the first message | Shared `ds/PillComposer` + a `variant` prop on Lane M's `ChatComposer`. Empty chat keeps the tall composer; the thread and the workspace clarify stage get the pill. |

**Verification method — and its one limit.** The design source could NOT be
re-fetched to disk this round: `DesignSync.get_file` caps at 256 KiB and the file
is 419 KB, Chrome's Local Network Access permission blocks an HTTPS page from
POSTing to a localhost receiver, and content returned from the claude.ai origin
through the browser tool is filtered. Parity was therefore established the way
rules/app.md actually mandates — against the **rendered** design, driven live in
the design app's present mode (`?present=1`), state by state. What that costs:
the design renders in a cross-origin iframe, so computed styles could not be
probed. Geometry was measured **on the app side** and reconciled against the
design's own layout behaviour, e.g. the suggestion chips: the design fits two on
the first row at the docked width, mine fitted one until the chip type dropped to
12px/11px padding (measured: 159 + 156 on row 1, 193 on row 2, panel 380px).

**Correction round, same afternoon (`abb1556`).** The founder compared the built
panel against his own reference capture and caught three things:

1. **The panel opened cold rendered findings straight away; the design shows a
   hero.** Serif "Ask anything of" over the agent name in mono, the description,
   and the three suggestions as **plain stacked text** rather than pills. Findings
   arrive with the first exchange — which is exactly what "Show me what you found"
   asks for — so asking a suggestion moves the panel into the conversation view.
   The miss is instructive: I built the populated state from a *recent-chat*
   capture and never opened an agent cold, so I never saw that the empty state is
   a different **layout**, not the same layout with less in it.
2. **Company is a scope again, alongside Sector** (founder call): pointing an agent
   at one issuer and at a whole sector are different jobs. Five kinds now →
   `Call / Workspace / Company / Sector / Report`. The panel lays them out 3-up;
   the create modal still fits one row. Measured in both locales: dock 110px each,
   modal 88px each, Hebrew uniform 31px height, nothing clipped or wrapped.
3. **Widen / narrow use the design's diagonal double-arrows** (new
   `ExpandDiagonalIcon` / `CollapseDiagonalIcon`); the corner-bracket `ExpandIcon`
   stays where it is used elsewhere.

The scope test added earlier **failed** on the new list rather than passing
silently — the test doing its job — and was updated deliberately.

Note on method: coordinate-driven clicking became unreliable when the browser
window changed size mid-session (a click landed on Close instead of Widen once).
The correction round was walked with DOM-driven clicks instead, which is what the
recorded results above come from.

Known deltas left standing, deliberately:

- The chat pill is 672px wide (Lane M's existing composer width); the design's is
  ~727px and sits slightly wider than its message column. Changing it would move
  the empty-state composer too, which the founder did not ask for.
- The workspace clarify chips still read "Latest investor deck" / "Annual reports"
  where the design says "Including the Q2 2026 deck" / "Including ועד העובדים
  report". Pre-existing from the first import, not part of this round's asks.
- The expand/collapse glyphs are corner-brackets and chevrons; the design uses
  diagonal arrows.

Battery after **that** round: **152/152** (149 + 3 new agent-seed tests) · tsc · build
green. The build first failed with `MODULE_NOT_FOUND` on `_document` — the
documented "dev server owns `.next`" trap, not a broken branch; killed dev, removed
`.next`, rebuilt green, restarted dev on :3001.

Checked with my own eyes, both locales: agents page with Recent chats, the docked
panel, the widened panel, the workspace picker headline, intake intro (one
composer), intake clarify (pill), chat empty (tall) and chat after send (pill).
Hebrew RTL mirrors correctly in the new pill — `+` on the start edge, mic and send
on the end edge — and the agent panel docks to the left with Hebrew tabs and
`הדגמה` markers intact.

## 4c. Review round — the five fixes (2026-08-01)

`atlas-reviewer` (cold context) + the supervisor returned **CHANGES, 24 findings**. The founder
then made a scope call that closed most of them: *"everything the reviewer said we don't have
code to is completely fine since this is only a frontend import, once you merge Lane M will
build the actual backend on all of them."* Five survived — none needing a backend — plus the
evidence corrections above.

| # | Defect | Fix |
|---|---|---|
| 1 | `WorkingDocument` showed "✓ Saved just now", and `WorkspaceShell` a static "Draft · saved just now". **Nothing saves** — edits live in session state and die on reload. | Both removed. The `saved` state and its `onInput` reset went with them; `docDraftMeta` is now just "Draft". `savedJustNow` deleted from both dictionaries. |
| 2 | The invented Hebrew quote attributed to a **named executive of a real TASE issuer** carried an English-only `— DEMO, invented quote` hardcoded inside `SEED_HTML`. A Hebrew reader saw **no marker** on the most fact-shaped element in the branch, and because it sat inside `contentEditable` the user could delete it — after which it exported into the PDF unmarked. | **Round 2 (supervisor), superseding the round-1 fix.** Round 1 moved the marker out of `SEED_HTML` into a localized `DemoInline` notice **outside** the editable body — correct for deletability and for Hebrew, but it claimed the marker "survives into Export as PDF", **and that was false**: the notice sits at the top of the `overflow-auto` pane, and `window.print()` on this layout emits one page clipped to the scroll offset, so exporting while scrolled to the quote produced the fabricated quote with **no marker at all**. The re-gate proved it with a real Chromium `page.pdf()` + pdfjs extraction (marker ABSENT, quote PRESENT, 1 page). On the print path the round-1 fix was a **regression**. Now: the outside notice is kept (covers the screen, non-deletable) **plus** a localized marker built from the dictionary is restored inside the `<cite>` (covers copy-paste and a plain browser Ctrl+P), **and Export as PDF is disabled outright** alongside Export as Word. `SEED_HTML` became `seedHtml(dict)` so the in-quote marker can never be English-only again. |
| 3 | Report targets duplicated ("2025 annual.pdf" appears in several workspaces), and `CreateAgent` keyed rows on `t.label` and selected by label equality → one click filled **both** radios and React logged a duplicate key. | New `AgentTarget` type carrying a stable `id`. Reports deduped by name at the route; the picker keys and selects on `id` and looks the label up only at submit. |
| 4 | `WorkspaceIntake`'s building line forced `dir="ltr"` + `font-mono-num` on `buildingSteps`, which is a Hebrew **sentence** — so it read in reverse. Iron rule 5 scopes those to numerals and tickers. | `dir="auto"`, mono dropped. The embedded Latin filename stays upright on its own: it is a strong-LTR run and the bidi algorithm handles it. |
| 5 | `onClick={onSend}` handed React's `MouseEvent` into `send(explicit?: string)`, so `(explicit ?? input).trim()` threw inside the click and the button silently did nothing. | `onClick={() => onSend()}`. **Fixed at both call sites, and this was live on main** — mouse-send was dead for real users in Ask Atlas and the chat page; keyboard Enter masked it. Two further sites of the same shape (`PillComposer`, `WorkspaceIntake`) were latent rather than broken (their callers take no argument) and were hardened in the same commit. |

The other 15 NITs stay filed in the ready queue and are carried, not silently dropped.

## 5. Headline stacks — measured, not assumed

`--head-font` resolves to `'Newsreader',Georgia,serif` in the rendered design, so every
headline that uses `var(--head-font)` is **serif**. Projects' H1, the project title and
the create-agent modal title were built on the sans stack and were corrected.

**The one divergence that needed a founder call is CLOSED (2026-08-01, same day).**
It was: the Workspaces picker H1 was *hardcoded* to the apple sans stack at weight 600
(design line 1269) rather than resolving `--head-font`, so matching the design moved that
H1 off Newsreader and reversed a design-round-2 consistency fix. This import reproduced it
faithfully and flagged it rather than "fixing" it silently. The founder's answer was to
rebuild the headline in the design **as serif**, and the app followed in `65a6235` — so the
design is no longer internally inconsistent and parity and consistency now agree. Filed as a
DECISION line in `agent-memory/cross-cutting.md`.

`probe/surfaces-parity.json` now carries BOTH records: the original measurement (kept, marked
superseded — a dated measurement is a record and is not rewritten) and a re-measurement of the
shipped H1 taken through an authenticated session with the final URL asserted:
`Newsreader, Georgia, serif` / 500 / 34px / -0.68px at `http://localhost:3001/app/workspace`.
The **design** side of that row was not re-probed and the probe says so — present mode renders
the design in a cross-origin iframe, so its serif headline was confirmed by eye, not measured.

`tokens.harvey.railText = #85817A` (the deliberate WCAG AA deviation) was **not** touched.

## 6. Parity probes

`probe/surfaces-parity.json` — measured against the **rendered** design served on `:4321`,
never bundle CSS. Float card anatomy (width, radius, border, background, both shadow
layers) is EXACT; the Projects card is EXACT.

Five hexes the new design regions use are **unset** in the design's own Harvey block, so
the rendered design falls back to warm literals there. Porting them verbatim would have
put beige onto Harvey cards — the exact stray-warm-hex defect filed in round 2. They were
mapped by role instead, and the faintest text tier became a new token
`tokens.harvey.inkGhost = #9C9C9C`. Decision filed in `agent-memory/cross-cutting.md`.

## 7. Scope lock — honoured

No tables, no migrations, no API routes, no persistence. Everything created or edited in
these surfaces lives in one client provider mounted in the `/app` shell and **resets on
reload**, by the founder's decision. `localStorage` was deliberately not used: imitating
persistence is this repo's filed fake-data defect class.

## 8. Known gaps carried into review

- **The project composer, the agent chat input and the workspace side-chat are inert.**
  There is no chat backend for these surfaces this chapter. They render disabled with a
  stated reason rather than accepting input that would go nowhere.
- **NEITHER export is implemented** — both rows render disabled with "Not in this build"
  rather than as dead buttons. **Export as PDF was disabled in the round-2 re-gate**: it had
  called `window.print()`, which on this layout (`h-screen` + `overflow-hidden` frame, document
  inside an `overflow-auto` pane) emits one page clipped to the current scroll offset — dropping
  the demo notice and exporting the fabricated quote unmarked. (`globals.css:488` *does* contain
  an `@media print` block, corrected below; it simply contains nothing that unclips this frame.)
  A correct Hebrew PDF needs a server-side render per `.claude/rules/app.md`; that is a feature,
  not a stopgap, so the honest state is "not in this build".
- **CORRECTION (review round 3, 2026-08-01) — the residual is not fully closed.** This section
  previously said the in-`<cite>` marker covers "a plain browser Ctrl+P". **Overstated.** The
  round-3 reviewer rebuilt the layout from the real `seedHtml(he)`, the real `.atlas-doc` CSS and
  the repo's own `@media print` block, and swept the pane's scroll offset through Chromium
  `page.pdf()` + pdfjs: there is a **~28px band (scrollTop 350–378 of a 1605px range)** where the
  print clip lands **between the quote and its cite line**, printing the fabricated Hebrew quote
  with neither marker. It is materially milder than the original BLOCKER — the attribution is
  clipped too, so no invented words are attributed to the named executive — and it is
  user-initiated rather than app-initiated, which is why the gate returned WARNING and not a
  re-BLOCK. Recorded rather than smoothed over: the app cannot fully control the browser's own
  print, and the real fix is that this fabricated block disappears once retrieval serves real
  quotes. This was the **third** round spent on this one element; see §11.
- **CORRECTION (review round, 2026-08-01).** This section previously asserted that "the
  workspace side-chat reuses the existing Ask Atlas component" and that Pinge's
  highlight-to-ask was reused. **Neither is in the branch** — nothing under
  `src/components/workspace/` imports `TranscriptChatPanel`, the Ask Atlas panel or the snip
  bridge; the single "Pinge" mention there is a comment describing a pointer-handling
  technique, not a reuse. The claims were written from intent rather than from the code. Not
  having built them is fine and the founder has closed it; the evidence asserting them was
  the same written-from-memory defect that cost the login-gate branch four review rounds, so
  it is corrected here rather than quietly deleted.
- **The `__chat` tab renders the tab shell only.** Wiring it to a side-chat is the one piece
  of design 2039 not finished, and is now closed by the founder's scope call — Lane M builds
  the backends for these surfaces after the merge.
- A mixed Hebrew/Latin citation source (`דוח ועד העובדים.pdf · p. 6`) reorders under RTL.
  Verified as **correct** Unicode bidi for a Hebrew reader, not a defect — recorded here
  so a reviewer does not "fix" it into something wrong.

## 9. Integration with the `/app/*` login gate (merged from main mid-chapter)

`origin/main` moved from `690e6bf` to `f05b659` while this chapter was building, adding
the login gate (`src/middleware.ts` + `lib/auth/gate.ts`). Every surface in this branch
lives under `/app/*`, so the gate now sits in front of all of them. Merged in at
`733b4ac`; the only conflict was `package.json`'s explicit test list, where both sides had
appended files — resolved as a union.

**Gate verified against the new routes** (dev server, no session):

| Route | Result |
|---|---|
| `/app/chat/projects` | 307 → `/?next=%2Fapp%2Fchat%2Fprojects` |
| `/app/workspace` | 307 → `/?next=%2Fapp%2Fworkspace` |
| `/app/agents` | 307 → `/?next=%2Fapp%2Fagents` |
| `/app/workspace/ws-tigbur-privatization` | 307 → `/?next=%2Fapp%2Fworkspace%2Fws-tigbur-privatization` |

All four gate correctly, and the deep link survives in `next` — including the dynamic
workspace id, which is the case most likely to have been dropped.

**Authed path verified after the merge:** loaded
`/app/workspace/ws-tigbur-privatization` in a genuinely signed-in browser; the gate passed
and the full control shell rendered (panel, Your Work, all four section counts, tab bar,
demo banner). Captured as `authed-workspace-shell-post-gate.jpg`. That image shows the
workspace shell with one file tab open; it does **not** show the document, legal or split
states.

Post-merge battery: **149/149** (this branch's 132 + the gate's 17) · tsc · build green.
