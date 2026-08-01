# Spec — Three-surfaces import: Projects · Workspace · Agents (2026-08-01)

> STATUS: APPROVED by the founder (2026-08-01, in-session, pre-approved sight-unseen with the
> instruction to proceed straight to plan + execution). Lane F · branch `feat/surfaces-import`
> off `main` @ `690e6bf` · port 3001.
>
> Source of truth for the visuals: `design-import/Atlas MVP.dc.html` (409,413 bytes, imported
> 2026-08-01 from claude.ai project `a041c61d`). The previous round is preserved beside it as
> `Atlas MVP.dc.html.prev` (310,406 bytes) for diffing. **Line numbers in this spec refer to the
> new file.**
>
> Founder brief this implements: `docs/product/2026-08-01-projects-workspace-agents-brief.md`.

## 1. What this chapter is

Import the three newly designed surfaces as real, navigable, faithfully-styled UI:

- **Projects** — a minor feature living inside the chat sub-panel (founder's framing).
- **Workspace** — a full page: the single-thesis workbench.
- **Agents** — a full page: persistent AI workers.

**Scope lock — UI ONLY. No backends.** No tables, no migrations, no API routes. The backends are
deliberately sequenced behind this chapter into other lanes (retrieval + Projects → Lane M;
Maya/TASE → Lane I; the `/app/*` login gate → supervisor). Where a surface needs data it does not
have, it is fed from a typed stub and **marked visibly as demo content in both locales**.

### Why UI first (the reasoning that shaped the scope)

Seeing all three rendered together is how the real data model gets discovered. A wrong page costs
an afternoon; a wrong table costs a migration dance on a database shared with production Timlul,
where in-place renames are forbidden.

This is also why the scope is **full fidelity, not just the headline state of each surface**. The
founder overruled an initial breadth-first proposal, and was right: the sub-states are exactly
where the data model lives. Legal Due-Diligence is what reveals that a finding has a severity and
a source file. "Actions taken" and "Agents used" define what a workspace records. The agent dock
defines what an agent *is* once it exists. Skipping them would leave the backend chapters
designing blind — the precise failure UI-first exists to prevent.

## 2. Founder decisions (filed in `agent-memory/cross-cutting.md`, 2026-08-01 late)

1. **Full fidelity** — every state in the design for these three surfaces, not a subset.
2. **Projects is minor** — it lives in the chat sub-panel, not as a top-level page.
3. **Session-only interactivity** — creating a project or an agent, editing Instructions/Memory,
   and typing in the working document all genuinely work, in React state, and **reset on reload**.
   No `localStorage`: imitating persistence is this repo's filed fake-data defect class.
4. **Demo content kept verbatim, marked unmissably** — a labelled bar in both locales on every
   stub-fed surface, plus inline `[DEMO]` markers on the citation block and the legal findings.

### 2.1 The honesty requirement is load-bearing, not decoration

`.claude/rules/app.md` records fabricated demo facts rendered as real as a **repeated** defect
class in this repo. This design is its most serious form yet: it ships invented financials for
**real TASE issuers** (Tigbur revenue ₪1.21B → ₪1.56B, 8.3% CAGR, 3.7% operating margin) and a
Hebrew quote dressed as a **sourced citation from a named executive**
(`מוטי בן־ארי · CEO · Q2 2026 call · Q2 2026 deck.pdf`).

The founder chose knowingly to keep this content, with marking carrying the honesty. The binding
rule for implementation:

> **If a screen shows a number, a quote, or a finding that no backend produced, that screen
> carries a visible demo marker — in Hebrew and in English.**

A citation block or a severity finding additionally carries an inline marker, because those two
elements specifically wear the costume of sourced fact.

## 3. Architecture

### 3.1 Routes

| Surface | Route | State |
|---|---|---|
| Projects list | `/app/chat/projects` | new |
| A project | `/app/chat/projects/[id]` | new |
| Workspace picker | `/app/workspace` | exists (stub page, extended) |
| Inside a workspace | `/app/workspace/[id]` | new |
| Agents | `/app/agents` | exists (stub page, extended) |

### 3.2 Projects inside the chat panel, without disturbing Lane M

The design is one page that swaps views; Atlas uses real URLs. Bridge: **`ChatView` gains one
optional prop** — a main view `ReactNode` rendered instead of the chat transcript when supplied.
The panel markup, the conversation state, and the existing tests are untouched; the Projects
routes supply their own content. The only other edit to `ChatView` is giving the currently-dead
"Projects" nav button (`ChatView.tsx:283`) a destination.

Rejected alternative: lifting chat state into a shared layout so the panel could persist across
routes. It is the cleaner abstraction and the wrong trade — it refactors another lane's surface
for no user-visible gain.

### 3.3 Session state that survives navigation

Because the app changes URL between the list and a project, plain page state would lose a
created project the moment it was opened. Session state therefore lives in **one small client
provider mounted in the `/app` shell layout** (`src/app/app/layout.tsx`), the same mechanism the
audio players already use to survive `/app/*` navigation.

- Holds: created projects, edits to Instructions/Memory/Context, created agents, working-document
  content, and open workspace tabs.
- Seeded from the stub modules on mount.
- **Resets on reload**, by design and by the founder's decision.

### 3.4 Reuse, not re-import

The design labels two elements as shared with the investor call — the highlight-to-ask toolbar and
the note composer — and labels the workspace side-chat "the standard side-chat". Atlas already
ships all three (Pinge marking UX; the 347px Ask Atlas panel from design round 2). The workspace
**reuses the existing components**. One Ask Atlas in the codebase, not two that drift apart.

### 3.5 The stub layer

Three typed modules, each the single data door for its surface:

- `src/lib/projects/data.ts` — **new**
- `src/lib/workspace/data.ts` — exists (picker data), extended
- `src/lib/agents/data.ts` — exists (agents/scheduled/finished), extended

Pages read **only** through these modules, so a backend chapter swaps the module rather than
rebuilding the page. New shapes the deeper states require: findings with severity + source file,
actions taken, agents used, agent runs and sessions, workspace files, context items with capacity,
project instructions/memory/context, document sections with citations.

## 4. Full state inventory (design line references)

Nothing on this list may be silently dropped. If a state proves unbuildable, it is reported, not
skipped.

### Projects — `1099–1262`
- Projects list, cards + "New project" (`1099`)
- A project (`1123`): main column (`1149`) — composer with "N sources in context", RECENTS list
- Right rail (`1180`): **Instructions** (`1184`) · **Memory** with "Only you" badge (`1202`) ·
  **Context** with capacity meter and file cards (`1226`)
- New-project flow (founder named it explicitly)

### Workspace — `1263–2084`
- **Picker** (`1263`): header row (`1267`), search (`1292`), grid (`1298`), **empty state** (`1317`)
- **Intake** (`1339`) — the workspace agent gathering material: intro (`1356`) → clarify loop
  (`1376`) → building (`1408`), with the intake composer (`1420`)
- **Control layout** (`1433`):
  - Workspace panel, floating card (`1437`)
  - Your Work: document + legal due-diligence (`1476`)
  - **Legal Due-Diligence** (`1489`): scoping (`1509`) → running (`1527`)
  - Workspace sections, press to open the detail column (`1546`)
  - **Detail column** (`1566`): Files (`1578`) · Agents (`1609`) · Chats (`1637`) · Actions (`1666`)
  - Panel collapsed — thin floating rail (`1703`)
  - Workspace main, floating card (`1714`): continuity line (`1717`), tab bar (`1726`)
  - Workspace chat pane as a tab (`1757`)
  - **Document** (`1802`)
  - **Legal agent chat** (`1888`)
  - No-tabs-open empty state (`1934`)
  - Docs single **or split, hairline gutters as drag handles** (`1942`)
  - Ask Atlas dock (`2009`) and the workspace's own agent as the standard side-chat (`2039`)

### Agents — `2085–2370`
- Command deck, the black strip (`2085`)
- Body (`2098`): My Agents (`2102`) · Finished tasks (`2175`) · Scheduled (`2191`)
- **Create agent** (`2211`) — name · description · assignment (workspace / company / call)
- **Agent dock** (`2263`): profile (`2290`) · chat opening on the findings (`2329`)

## 5. The working document

Genuinely editable, **without an editor library**. `contentEditable` plus the designed toolbar
(heading, bold, italic, bullet, quote, undo) applying formatting through the browser's built-in
editing. The autosave label ticks. "Continue this section" inserts a clearly-marked demo paragraph.
"Export" uses `window.print()` on the document — the repo's existing stopgap for Hebrew PDF
(`.claude/rules/app.md`: Hebrew needs a real browser engine; `react-pdf`/`html2canvas` garble
Hebrew next to numbers). No export API is added.

Rejected: TipTap/ProseMirror. It is what the feature eventually needs for citations that survive
editing, but it adds a dependency and commits to a document format **before the backend chapter
has decided how citations are stored**. That decision belongs to the chapter that builds
persistence, not to an import.

## 6. Verification

Per the `/verify-app` Frontend-import recipe and the parity laws it holds:

- Parity is measured against the **rendered** design (probe computed styles / canvas
  `measureText` on a local server serving `design-import/`), **never** bundle CSS — bundle CSS can
  be a stale iteration.
- Measure the **frame** before components.
- **A/B every page** against the design.
- Founder-reported diffs get measured before any code changes.
- Two font stacks: body = SF Pro Text stack (→ Segoe UI on Windows); headlines
  (`fontFamily.head`) = SF Pro Display **without** `system-ui` (→ Arial on Windows).
- `tokens.harvey.railText = #85817A` is a **deliberate** WCAG deviation from the design import
  (5.109:1). If the new source shows `#6B6862` there, it is flagged, not "fixed".

Every surface is verified eyes-on in **both locales** (EN + HE, `dir` correct, numbers/tickers
`font-mono-num` + `dir="ltr"`), with durable screenshots committed under
`docs/evidence/feat-surfaces-import/`.

**Evidence discipline** (this lane lost a round to it on 2026-07-31): an evidence caption is a
claim about an artifact. Captions are written from what is *in the frame*, and each artifact
states what it does **not** show.

Automated: node test files per stub module, following the repo pattern — and **appended to the
explicit file list in `package.json`'s `test` script**, or they silently never run. Plus
`npx tsc --noEmit` and `npm run build` green.

## 7. Build order

Each step is independently testable and ends green (tests · tsc · build).

1. Projects: stub module, list, a project, new-project flow — unblocks the dead nav button
2. Agents: command deck, My Agents, finished, scheduled, create agent, agent dock
3. Workspace: picker + empty state + intake sequence
4. Workspace control shell: floating panel, tab bar, detail column, collapsed rail
5. Working document: editor, toolbar, citations, export
6. Legal due-diligence: scoping, running, findings, legal agent chat
7. Split docs with drag gutters; side-chat and ask-dock wiring
8. Both locales, parity probes, committed evidence

## 8. Out of scope

- Any backend: tables, migrations, API routes, persistence.
- The in-call Ask Atlas panel shipped in design round 2 — untouched.
- Real Maya/TASE data (Lane I), retrieval (Lane M), the `/app/*` login gate (supervisor).
- Fixing `railText` back to the design's `#6B6862`.

## 9. Risks

- **Scale.** ~30 named states. Mitigation: the 8-step order above; each step commits green; the
  founder sees surfaces as they land.
- **Shared surfaces.** `ChatView` belongs to Lane M. Mitigation: one additive prop, tests kept
  green, heads-up already appended to `cross-cutting.md`.
- **Demo marking drifting off a screen as states multiply.** Mitigation: the marker is a shared
  component and the rule in §2.1 is checked per surface during verification.
- **Design/app divergence.** The design is a single-page mock; Atlas is routed and server-rendered.
  Where the design's mechanism cannot be reproduced faithfully, the *visual result* wins and the
  divergence is recorded in the evidence file.
