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
| `npm test` | **149/149** post-merge (108 before this chapter → 132 with this branch's 24 new → 149 with the gate's 17) |
| `npx tsc --noEmit` | green |
| `npm run build` | green (see §6) |
| Console errors, EN | **0** across 11 captured surfaces |
| Console errors, HE | **0** across 11 captured surfaces |

Console counts come from Playwright listeners on `console[type=error]` and `pageerror`
across every captured route, not from a spot check.

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
| Working document | ✅ EN + HE | ✅ citations line + the citation block's attribution |
| Legal findings | ✅ EN + HE | ✅ all 6 findings |
| Intake (building) | ✅ EN + HE | ✅ "nothing is actually being fetched" |

The most dangerous single element in this design is the working document's quote block:
a fabricated Hebrew quote attributed to a **named executive of a real TASE issuer**, with
a filing-shaped citation. It renders with the attribution line explicitly ending
`— DEMO, invented quote`, plus the page banner.

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

Battery after this round: **152/152** (149 + 3 new agent-seed tests) · tsc · build
green. The build first failed with `MODULE_NOT_FOUND` on `_document` — the
documented "dev server owns `.next`" trap, not a broken branch; killed dev, removed
`.next`, rebuilt green, restarted dev on :3001.

Checked with my own eyes, both locales: agents page with Recent chats, the docked
panel, the widened panel, the workspace picker headline, intake intro (one
composer), intake clarify (pill), chat empty (tall) and chat after send (pill).
Hebrew RTL mirrors correctly in the new pill — `+` on the start edge, mic and send
on the end edge — and the agent panel docks to the left with Hebrew tabs and
`הדגמה` markers intact.

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
DECISION line in `agent-memory/cross-cutting.md`. Original probe: `probe/surfaces-parity.json`.

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
- **Export as Word is not implemented** — it renders disabled with "Not in this build"
  rather than as a dead button. Export as PDF uses `window.print()` per rules/app.md.
- **The workspace side-chat reuses the existing Ask Atlas component** rather than a second
  copy, per the design's own label ("the standard side-chat"). Lane M was given a
  heads-up in cross-cutting before the change.
- **The `__chat` tab currently renders the tab shell only**; wiring it to the existing Ask
  Atlas panel is the one piece of design 2039 not finished.
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
