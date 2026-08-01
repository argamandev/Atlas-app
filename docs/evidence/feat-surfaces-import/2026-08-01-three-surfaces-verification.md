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
| `npm test` | **132/132** (108 before this chapter → 24 new) |
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

## 5. Headline stacks — measured, not assumed

`--head-font` resolves to `'Newsreader',Georgia,serif` in the rendered design, so every
headline that uses `var(--head-font)` is **serif**. Projects' H1, the project title and
the create-agent modal title were built on the sans stack and were corrected.

**One deliberate divergence needing a founder call:** the Workspaces picker H1 is
*hardcoded* to the apple sans stack at weight 600 (design line 1269) — it does not use
`--head-font`. Matching the design therefore moves that H1 off Newsreader, reversing a
design-round-2 consistency fix. The design is internally inconsistent here; this import
reproduces it faithfully. Probe: `probe/surfaces-parity.json`.

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
