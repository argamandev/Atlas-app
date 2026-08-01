# Three-Surfaces Import (Projects · Workspace · Agents) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md
> (merged to main 2026-08-01 as part of fix/surfaces-export-marker, which carried feat/surfaces-import.)


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task (the founder asked for inline execution in this session; no subagents).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the three newly designed surfaces — Projects (inside the chat sub-panel),
Workspace, and Agents — as real, navigable, faithfully-styled UI at full fidelity, fed by typed
stubs and visibly marked as demo content in both locales.

**Architecture:** Each surface reads through exactly one typed stub module, so a backend chapter
swaps the module instead of rebuilding the page. Session-only mutations (create a project, edit
Instructions, type the document) live in one client provider mounted in the `/app` shell so they
survive `/app/*` navigation and reset on reload. Projects reaches the chat surface through a
single additive prop on `ChatView`, leaving Lane M's conversation state and tests untouched.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind (Harvey tokens off `:root` in
`globals.css`) · node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-08-01-three-surfaces-import-design.md`
**Design authority:** `design-import/Atlas MVP.dc.html` (409,413 bytes). All line numbers below
refer to that file. Serve it for parity work with `npx http-server -p 4321 -c-1` from
`design-import/` — **never** a lane port.

## Global Constraints

- **Scope lock: UI only.** No tables, no migrations, no API routes, no persistence. If a step
  seems to need one, stop and report instead.
- **Demo marking rule:** if a screen shows a number, a quote, or a finding that no backend
  produced, that screen carries a visible demo marker — **in Hebrew and English**. Citation blocks
  and severity findings additionally carry an inline marker.
- **Session-only state.** React state only. No `localStorage`, no cookies, no server writes.
- **Harvey is the only theme.** The 8 `call-*` Tailwind aliases and the `data-scheme` cycle no
  longer exist. Use `globals.css` classes off `:root` vars; `floatLine` / `border-float-line` /
  `rounded-win` / `bg-canvas` for pane floats. Tailwind emits nothing for an unknown colour, so a
  stray `bg-call-*` fails **silently**.
- **`tokens.harvey.railText = #85817A`** is a deliberate WCAG AA deviation (5.109:1). If the
  design source shows `#6B6862`, flag it — do not "fix" it back.
- **Two font stacks:** body = SF Pro Text stack (→ Segoe UI on Windows); headlines
  (`fontFamily.head`) = SF Pro Display **without** `system-ui` (→ Arial on Windows).
- **Parity is measured against the RENDERED design** (probe computed styles on `:4321`), never
  bundle CSS. Measure the frame before components. A/B every page.
- **RTL:** Hebrew `dir="rtl"`; numbers/tickers `font-mono-num` + `dir="ltr"`; test bidi visually.
- **New test files must be appended to the explicit list in `package.json`'s `test` script**, or
  they silently never run.
- **Do not touch:** the in-call Ask Atlas panel, `TranscriptChatPanel`, the pdf.js CSS cluster,
  live-engine views.
- Every task ends green: `npm test` · `npx tsc --noEmit` · commit. `npm run build` at Tasks 3, 6,
  9, 13. **Never run `npm run build` while the dev server is up** — it clobbers `.next` and yields
  a MODULE_NOT_FOUND white screen (kill dev → `rm -rf .next` → rebuild).
- Dev server for eyes-on: `npm run dev -- -p 3001`. Hard-refresh (Ctrl+Shift+R) after restarts.

---

## File Structure

**Create:**
- `src/lib/demo/DemoStateProvider.tsx` — client provider: session-only mutations for all three surfaces
- `src/lib/projects/data.ts` + `data.test.ts` — projects stub
- `src/components/ds/DemoBanner.tsx` — the shared demo marker (bar + inline variants)
- `src/components/projects/ProjectsList.tsx`, `ProjectView.tsx`
- `src/components/agents/AgentsPage.tsx`, `CommandDeck.tsx`, `CreateAgent.tsx`, `AgentDock.tsx`
- `src/components/workspace/WorkspaceIntake.tsx`, `WorkspaceShell.tsx`, `WorkspacePanel.tsx`,
  `WorkspaceDetailColumn.tsx`, `WorkspaceTabBar.tsx`, `WorkingDocument.tsx`,
  `LegalDueDiligence.tsx`, `LegalAgentChat.tsx`, `WorkspaceDocs.tsx`
- `src/app/app/chat/projects/page.tsx`, `src/app/app/chat/projects/[id]/page.tsx`
- `src/app/app/workspace/[id]/page.tsx`

**Modify:**
- `src/lib/workspace/data.ts` + `data.test.ts` — extend with files/agents/actions/threads/findings
- `src/lib/agents/data.ts` + `data.test.ts` — extend with scope, findings, lead, sessions
- `src/components/chat/ChatView.tsx` — one optional `mainView` prop + Projects nav destination
- `src/components/workspace/WorkspacePicker.tsx` — sort control, empty state, new workspace
- `src/app/app/agents/page.tsx`, `src/app/app/workspace/page.tsx`
- `src/app/app/layout.tsx` — mount `DemoStateProvider`
- `src/lib/i18n/dictionaries/en.ts`, `he.ts` — all new copy
- `package.json` — test file list

---

### Task 1: Demo marker + session-state provider

Foundation for every later task. Nothing renders demo content until this exists.

**Files:**
- Create: `src/components/ds/DemoBanner.tsx`, `src/lib/demo/DemoStateProvider.tsx`
- Modify: `src/app/app/layout.tsx`, `src/lib/i18n/dictionaries/en.ts`, `he.ts`

**Interfaces produced:**
```ts
// DemoBanner.tsx
export function DemoBanner(): JSX.Element            // full-width labelled bar
export function DemoInline({ label }: { label?: string }): JSX.Element  // [DEMO] chip

// DemoStateProvider.tsx
export type DemoState = {
  projects: Project[]
  agents: AgentCard[]
  workspaces: Workspace[]
  docHtml: Record<string, string>      // workspaceId -> working-document HTML
}
export function DemoStateProvider(props: { seed: DemoState; children: React.ReactNode }): JSX.Element
export function useDemoState(): DemoState & {
  addProject(name: string): string                   // returns new project id
  patchProject(id: string, patch: Partial<Project>): void
  addAgent(a: Omit<AgentCard, 'id'>): string
  addWorkspace(name: string): string
  setDocHtml(workspaceId: string, html: string): void
}
```

- [ ] **Step 1: Write the failing test** — `src/lib/demo/demoState.test.ts`, testing the pure
  reducer (not React). Extract the mutations into `src/lib/demo/reducer.ts` so they are testable
  without a DOM (the repo has **no DOM test infra** — node:test only).

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoReducer, type DemoState } from './reducer'

const seed: DemoState = { projects: [], agents: [], workspaces: [], docHtml: {} }

test('addProject appends a project and returns a fresh id', () => {
  const next = demoReducer(seed, { type: 'addProject', name: 'Shipping sector' })
  assert.equal(next.projects.length, 1)
  assert.equal(next.projects[0].name, 'Shipping sector')
  assert.ok(next.projects[0].id.length > 0)
})

test('patchProject edits only the addressed project', () => {
  const a = demoReducer(seed, { type: 'addProject', name: 'A' })
  const b = demoReducer(a, { type: 'addProject', name: 'B' })
  const id = b.projects[0].id
  const next = demoReducer(b, { type: 'patchProject', id, patch: { instructions: 'x' } })
  assert.equal(next.projects[0].instructions, 'x')
  assert.equal(next.projects[1].instructions, '')
})

test('setDocHtml is keyed per workspace', () => {
  const next = demoReducer(seed, { type: 'setDocHtml', workspaceId: 'tigbur', html: '<p>hi</p>' })
  assert.equal(next.docHtml.tigbur, '<p>hi</p>')
  assert.equal(next.docHtml.qualitau, undefined)
})
```

- [ ] **Step 2: Add the test file to `package.json`'s `test` script** (append
  `src/lib/demo/demoState.test.ts` to the list). Run `npm test` — expected: FAIL,
  `Cannot find module './reducer'`.
- [ ] **Step 3: Write `src/lib/demo/reducer.ts`** — `DemoState`, a `DemoAction` union
  (`addProject` · `patchProject` · `addAgent` · `addWorkspace` · `setDocHtml`), and a pure
  `demoReducer`. New ids: `` `p${state.projects.length + 1}-${name.length}` `` style deterministic
  strings (no `Date.now()`/`Math.random()` — keeps the reducer pure and testable).
- [ ] **Step 4: Run `npm test`** — expected: PASS.
- [ ] **Step 5: Write `DemoStateProvider.tsx`** — `'use client'`, `useReducer(demoReducer, seed)`,
  context + `useDemoState()` hook that throws a named error outside the provider.
- [ ] **Step 6: Write `DemoBanner.tsx`** — `'use client'` not required; reads the dictionary.
  Bar: full width, `bg-panel`, `border-b border-hairline`, warning glyph, text
  `dict.demo.bannerTitle` + `dict.demo.bannerBody`, `role="note"`. Inline: small uppercase
  `[DEMO]` chip, `text-[10px]`, `tracking-[0.1em]`, muted amber on `bg-panel`, `title` attribute
  carrying `dict.demo.inlineHint`. Both must read correctly under `dir="rtl"`.
- [ ] **Step 7: Dictionary keys** — add to `en.ts` and `he.ts` under a new `demo` section:
  `bannerTitle` ("Demo content" / "תוכן לדוגמה"), `bannerBody` ("Sample data — not real analysis.
  Figures, quotes and findings on this page are invented." / "נתוני דוגמה — לא ניתוח אמיתי.
  הנתונים, הציטוטים והממצאים בעמוד זה מומצאים."), `inlineHint`, `inlineLabel` ("DEMO" / "דמו").
- [ ] **Step 8: Mount the provider** in `src/app/app/layout.tsx`, inside `LiveAudioProvider`,
  wrapping `ShellChrome`. Seed it from the three stub modules (server-side reads passed as props).
  Until Tasks 2/4/7 extend them, seed `projects: []`.
- [ ] **Step 9:** `npm test` · `npx tsc --noEmit` — both green.
- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(surfaces-import): demo marker + session-state provider"
```

---

### Task 2: Projects stub module

**Files:**
- Create: `src/lib/projects/data.ts`, `src/lib/projects/data.test.ts`
- Modify: `package.json`

**Interfaces produced:**
```ts
export type ContextItem = { name: string; meta: string; kind: 'XLSX' | 'PDF' | 'TEXT' }
export type ProjectChat = { title: string; when: string }
export type Project = {
  id: string
  name: string
  pinned: boolean
  instructions: string
  memory: string
  memWhen: string
  capacity: number            // 0-100, "% of project capacity used"
  context: ContextItem[]
  chats: ProjectChat[]
}
export async function getProjects(): Promise<Project[]>
export function emptyProject(id: string, name: string): Project
```

- [ ] **Step 1: Write the failing test** — `src/lib/projects/data.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getProjects, emptyProject } from './data'

test('demo projects mirror the design seed', async () => {
  const projects = await getProjects()
  assert.equal(projects.length, 3)
  assert.deepEqual(projects.map((p) => p.name), ['Shipping sector', 'Q2 2026 earnings', 'Defense watch'])
  assert.equal(projects[0].pinned, true)
  assert.equal(projects[0].capacity, 14)
  assert.equal(projects[0].context.length, 3)
  assert.equal(projects[0].chats.length, 4)
})

test('context items carry a kind badge the UI can render', async () => {
  const [shipping] = await getProjects()
  assert.deepEqual(shipping.context.map((c) => c.kind), ['XLSX', 'PDF', 'TEXT'])
})

test('emptyProject starts blank so a new project is visibly empty', () => {
  const p = emptyProject('p9', 'Untitled project')
  assert.equal(p.instructions, '')
  assert.equal(p.memory, '')
  assert.equal(p.memWhen, 'Never updated')
  assert.equal(p.capacity, 0)
  assert.deepEqual(p.context, [])
  assert.deepEqual(p.chats, [])
})
```

- [ ] **Step 2: Append `src/lib/projects/data.test.ts` to `package.json`'s test list.** Run
  `npm test` — expected: FAIL, module not found.
- [ ] **Step 3: Write `src/lib/projects/data.ts`** — port the seed verbatim from design
  `2465–2489` (three projects: Shipping sector / Q2 2026 earnings / Defense watch, with their
  instructions, memory, memWhen, capacity, context and chats). Header comment in the house style
  used by `lib/workspace/data.ts`: FRONTEND-ONLY STUB, names the design region, states that the
  backend swap happens here.
- [ ] **Step 4: Run `npm test`** — expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `git commit -am "feat(surfaces-import): projects stub module"`

---

### Task 3: Projects UI + wire the dead nav button

**Files:**
- Create: `src/components/projects/ProjectsList.tsx`, `src/components/projects/ProjectView.tsx`,
  `src/app/app/chat/projects/page.tsx`, `src/app/app/chat/projects/[id]/page.tsx`
- Modify: `src/components/chat/ChatView.tsx:270-316`, dictionaries

**Interfaces consumed:** `getProjects`, `emptyProject`, `useDemoState`, `DemoBanner`, `DemoInline`

**Interfaces produced:**
```ts
// ChatView gains ONE optional prop; everything else is unchanged.
type ChatViewProps = { /* existing */ mainView?: React.ReactNode }
```

- [ ] **Step 1: `ChatView` additive change.** Add `mainView?: React.ReactNode` to the props type.
  In the return, pass `{mainView ?? content}` as the `CollapsiblePanel` child. Change the Projects
  `<button>` at `ChatView.tsx:283` into `<Link href="/app/chat/projects">` matching the styling of
  the Workspace/Agents links directly beneath it. **Do not touch** the panel markup, conversation
  state, or `ChatHistory`.
- [ ] **Step 2: Run `npm test`** — Lane M's chat tests must stay green. If any fail, stop and
  report rather than editing their expectations.
- [ ] **Step 3: `ProjectsList.tsx`** (`'use client'`) — port design `1099–1122`: page title
  "Projects", subtitle "Group related chats, pinned files, and companies into one context.",
  2-column card grid; each card = folder glyph, name, mono meta `N chats · N in context`; final
  dashed tile `+ New project`. Clicking a card routes to `/app/chat/projects/<id>`. Clicking
  `New project` calls `addProject` from `useDemoState()` then routes to the new id.
  `<DemoBanner />` at the top.
- [ ] **Step 4: `ProjectView.tsx`** (`'use client'`) — port design `1123–1262`:
  - breadcrumb `Projects / <name>`, title, pencil (rename, session-only) + pin icons
  - main column (`1149`): composer "Start a chat in `<name>`…" with `+` and `@` affordances and a
    mono right-hand label `N sources in context`; below it `RECENTS N` and the chat rows
    (title + relative time). Composer is **inert** — this chapter adds no chat backend; give it
    `aria-disabled` and the `DemoInline` marker so it cannot be mistaken for working.
  - right rail (`1180`): **Instructions** card (`1184`) with `+`/edit → textarea → save into
    `patchProject`; **Memory** card (`1202`) with the "Only you" lock badge, body text, and
    `Last updated …` line; **Context** card (`1226`) with search + `+`, the
    `N% of project capacity used` meter, and file cards carrying `XLSX`/`PDF`/`TEXT` badges.
    Adding a context source appends `{ name: 'New source N', meta: 'just added', kind: 'TEXT' }`
    and raises capacity by 6, capped at 100 (design `2883`).
- [ ] **Step 5: Routes.** `page.tsx` (server) reads `getProjects()` and renders
  `<ChatView mainView={<ProjectsList … />} />`; `[id]/page.tsx` renders
  `<ChatView mainView={<ProjectView … />} />`. Unknown id → `notFound()`.
- [ ] **Step 6: Dictionary keys** for every string above in `en.ts` + `he.ts`.
- [ ] **Step 7: Eyes-on** on `:3001` — `/app/chat` panel → Projects → a project → back; create a
  project, open it, return to the list, confirm it is still there; reload, confirm it is gone.
  Hebrew locale: layout mirrors, counts stay LTR mono.
- [ ] **Step 8:** `npm test` · `npx tsc --noEmit` · `npm run build` (dev server stopped first).
- [ ] **Step 9: Commit** `git commit -am "feat(surfaces-import): Projects in the chat panel"`

---

### Task 4: Agents stub extension

**Files:** Modify `src/lib/agents/data.ts`, `src/lib/agents/data.test.ts`

**Interfaces produced:**
```ts
export type AgentFinding = { text: string; src: string }
export type AgentCard = {
  id: string
  name: string                 // terminal-style, e.g. "analyst"
  ini: string                  // "AN"
  domain: string               // existing field, e.g. "EARNINGS & GUIDANCE"
  role: string                 // "Earnings & guidance"
  description: string
  status: 'idle' | 'running'
  scopeKind: 'Workspace' | 'Company' | 'Call' | 'Report'
  scopeTarget: string
  done: boolean
  task: string
  out: string
  when: string
  lead: string
  findings: AgentFinding[]
}
export const AGENT_SCOPE_KINDS: readonly AgentCard['scopeKind'][]
export function emptyAgent(id: string, name: string): AgentCard
```

- [ ] **Step 1: Extend `data.test.ts`** with cases asserting: both demo agents carry `findings`
  with a `src` on every finding (the citation shape the dock renders); `scopeKind` is one of
  `AGENT_SCOPE_KINDS`; `emptyAgent` returns `status: 'idle'`, `done: false`, `findings: []`.
- [ ] **Step 2: `npm test`** — expected: FAIL on the new assertions.
- [ ] **Step 3: Extend `src/lib/agents/data.ts`** — port design `2573–2594` onto the existing
  `AgentCard` (keep `domain`, add the new fields). Keep `scheduled` and `finished` as they are.
- [ ] **Step 4: `npm test`** → PASS · `npx tsc --noEmit` — fix any consumer the widened type breaks.
- [ ] **Step 5: Commit** `git commit -am "feat(surfaces-import): agents stub gains scope + findings"`

---

### Task 5: Agents page — command deck, grid, finished, scheduled

**Files:**
- Create: `src/components/agents/AgentsPage.tsx`, `src/components/agents/CommandDeck.tsx`
- Modify: `src/app/app/agents/page.tsx`, dictionaries

- [ ] **Step 1: `CommandDeck.tsx`** — port design `2085–2097`: full-bleed black strip at the top
  of the page area, three faint `>` lines then `> Ready when you are.` in mono. Fixed height,
  hugs the `>` lines (design comment: "tight strip"). Static this chapter — no terminal input.
- [ ] **Step 2: `AgentsPage.tsx`** (`'use client'`) — port design `2098–2210`:
  `MY AGENTS` label + search field; agent cards (mono `> name`, `idle` dot, small-caps domain,
  description); dashed `+ Create an agent` tile; `FINISHED TASKS` rows (check glyph, title, mono
  meta, chevron) opening the dock on that agent; right column `SCHEDULED AGENTS` with clock rows
  and mono cadence chips. `<DemoBanner />` under the command deck.
- [ ] **Step 3:** Rewrite `src/app/app/agents/page.tsx` to read `getAgentsPageData()` and render
  the new component, replacing the 2026-07-14 stub page body.
- [ ] **Step 4:** Search filters the agent grid by name/domain/description (client, case-insensitive).
- [ ] **Step 5: Dictionary keys**; eyes-on both locales on `:3001`.
- [ ] **Step 6:** `npm test` · `npx tsc --noEmit`.
- [ ] **Step 7: Commit** `git commit -am "feat(surfaces-import): agents page — deck, grid, finished, scheduled"`

---

### Task 6: Create agent + agent dock

**Files:** Create `src/components/agents/CreateAgent.tsx`, `src/components/agents/AgentDock.tsx`

- [ ] **Step 1: `CreateAgent.tsx`** — port design `2211–2262`: name field; description textarea
  whose placeholder encourages detail (the brief asks for this hint explicitly); assignment
  picker over `AGENT_SCOPE_KINDS` (Workspace · Company · Call) plus a target line. Submit calls
  `addAgent` from `useDemoState()` and returns to the grid with the new card present.
- [ ] **Step 2: Validation** — submit disabled until name and description are non-empty. No
  invented rules beyond that.
- [ ] **Step 3: `AgentDock.tsx`** — port design `2263–2370`: right-hand dock with two tabs.
  **Profile** (`2290`): initials tile, name, role, scope line, "what it did last" block.
  **Chat** (`2329`): opens on the findings — the agent's `lead` line, then each finding as a row
  with its `src` citation. Every finding row carries `<DemoInline />` (spec §2.1: findings wear
  the costume of sourced fact).
- [ ] **Step 4:** Wire: clicking an agent card or a finished-task row opens the dock; Esc and the
  close button dismiss it.
- [ ] **Step 5:** Eyes-on both locales; create an agent, confirm it appears, reload, confirm it is gone.
- [ ] **Step 6:** `npm test` · `npx tsc --noEmit` · `npm run build`.
- [ ] **Step 7: Commit** `git commit -am "feat(surfaces-import): create agent + agent dock"`

---

### Task 7: Workspace stub extension

**Files:** Modify `src/lib/workspace/data.ts`, `src/lib/workspace/data.test.ts`

**Interfaces produced:**
```ts
export type WsFileKind = 'pdf' | 'xlsx' | 'slide'
export type WsFile = { id: string; name: string; kind: WsFileKind; year?: string; live?: boolean }
export type WsThread = { id: string; title: string; snippet: string; when: string; group: 'Today' | 'Yesterday' | 'Earlier' }
export type WsAgent = { name: string; ini: string; role: string; read: string; when: string; findings: string[] }
export type WsAction = { text: string; when: string; kind: 'open' | 'build' | 'agent' | 'doc' }
export type WsSession = { label: string; items: WsAction[] }
export type LegalSeverity = 'flag' | 'medium' | 'clear'
export type LegalFinding = { sev: string; k: LegalSeverity; text: string; src: string }
export type Workspace = {
  id: string; name: string; subtitle: string; fileCount: number; updatedLabel: string; initial: string
  company: string; sub: string
  files: WsFile[]; agents: string[]; actions: string[]
}
export async function getWorkspaces(): Promise<Workspace[]>
export async function getWorkspace(id: string): Promise<Workspace | null>
export const WS_SORTS: { updated: string; name: string; files: string }
export const WS_THREADS: WsThread[]
export const WS_AGENT_PROFILES: Record<string, Omit<WsAgent, 'name'>>
export const WS_SESSIONS: WsSession[]
export const LEGAL_AREAS: readonly string[]
export const LEGAL_STEPS: readonly string[]
export const LEGAL_FINDINGS: LegalFinding[]
export const SYSTEM_AGENTS: readonly string[]
export function emptyWorkspace(id: string, name: string): Workspace
```

- [ ] **Step 1: Extend `data.test.ts`** — assert: the three demo workspaces keep their existing
  names/subtitles (no regression on the 2026-07-14 shape); `getWorkspace('tigbur')` returns 6
  files; every `LEGAL_FINDINGS` entry has a non-empty `src` and a `k` in
  `['flag','medium','clear']`; `LEGAL_STEPS` has 5 entries; `WS_THREADS` groups cover
  Today/Yesterday/Earlier; `emptyWorkspace` returns `files: []` so the intake state is reachable.
- [ ] **Step 2: `npm test`** — expected: FAIL.
- [ ] **Step 3: Extend `src/lib/workspace/data.ts`** — port verbatim: workspaces + files
  (`2493–2512`), `WS_SORTS` (`3490`), threads (`3505–3511`), agent profiles `AG` (`3585–3592`),
  sessions (`3600–3615`), legal areas (`3643`), `LEGAL_STEPS` (`3647`), findings (`3653–3660`),
  `SYSTEM_AGENTS` (`3829`). Keep the existing exported fields so nothing that already reads this
  module breaks.
- [ ] **Step 4: `npm test`** → PASS · `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `git commit -am "feat(surfaces-import): workspace stub gains files, agents, actions, legal findings"`

---

### Task 8: Workspace picker + empty state + intake

**Files:**
- Create: `src/components/workspace/WorkspaceIntake.tsx`, `src/app/app/workspace/[id]/page.tsx`
- Modify: `src/components/workspace/WorkspacePicker.tsx`, `src/app/app/workspace/page.tsx`

- [ ] **Step 1: Extend `WorkspacePicker.tsx`** — port design `1263–1335`: header row with the
  `Last updated ⌄` sort control (options from `WS_SORTS`, click-outside to close) and the black
  `+ New workspace` button; existing search; card grid; **empty state** (`1317`) with the two
  copy variants — searching → `No matches` / `No workspaces match "<q>"`; genuinely empty →
  `Nothing open yet.` / `A workspace is one company or sector — its files, agents, and history,
  in one place.` `<DemoBanner />` at the top.
- [ ] **Step 2:** `+ New workspace` calls `addWorkspace` then routes to `/app/workspace/<id>`.
  A new workspace has **no files**, so it lands in intake.
- [ ] **Step 3: `WorkspaceIntake.tsx`** (`'use client'`) — port design `1339–1432`, three stages:
  **intro** (`1356`) — the workspace agent's opening ask; **clarify** (`1376`) — period chips
  (`2022–2025` · `Last 2 years` · `Just latest`) plus deck/report toggles (design `3680–3681`);
  **building** (`1408`) — progress lines. Advance on the intake composer's submit (`1420`).
  Stages are local state; no timers that fabricate progress against a real backend — the
  building stage is reached by user action and carries `<DemoInline />`.
- [ ] **Step 4: Route** `src/app/app/workspace/[id]/page.tsx` — server component: `getWorkspace(id)`,
  `notFound()` when missing; renders intake when `files.length === 0`, otherwise the control shell
  from Task 9 (stub the shell import this task with a placeholder that renders the picker link,
  and replace it in Task 9).
- [ ] **Step 5:** Dictionary keys; eyes-on both locales; verify a created workspace reaches intake.
- [ ] **Step 6:** `npm test` · `npx tsc --noEmit`.
- [ ] **Step 7: Commit** `git commit -am "feat(surfaces-import): workspace picker, empty state, intake"`

---

### Task 9: Workspace control shell — panel, sections, detail column, tab bar

**Files:** Create `WorkspaceShell.tsx`, `WorkspacePanel.tsx`, `WorkspaceDetailColumn.tsx`,
`WorkspaceTabBar.tsx`, `WorkspaceDocs.tsx`

- [ ] **Step 1: `WorkspaceShell.tsx`** (`'use client'`) — the two-column control layout
  (design `1433–1436`): floating panel on the inline-start, floating main card on the end. Owns
  tab state (`openTabs`, `activeTab`), detail-column state, and panel-collapsed state. Use
  `border-float-line` / `rounded-win` / `bg-canvas` for both floats — **not** inline hex.
- [ ] **Step 2: `WorkspacePanel.tsx`** — port design `1437–1565`: back link `All workspaces`,
  workspace identity row with rename pencil, black `New workspace chat` button, `YOUR WORK`
  section (document row + Legal Due-Diligence row), then `WORKSPACE` sections list
  (Workspace files · Agents used · Actions taken · Chats) with counts and a chevron that rotates
  when its detail is open (design `3623–3638`).
- [ ] **Step 3: `WorkspaceDetailColumn.tsx`** — port design `1566–1702`, slides out beside the
  panel, four bodies: **Files** (`1578`) with kind badges PDF/XLS/DECK and the meta line from
  design `3530`; **Agents** (`1609`) with initials, role, what it read, when, and its findings;
  **Chats** (`1637`) grouped Today/Yesterday/Earlier from `WS_THREADS`; **Actions** (`1666`)
  as the session timeline from `WS_SESSIONS` with the four dot kinds.
- [ ] **Step 4: Collapsed rail** — port design `1703–1713`: panel collapses to a thin floating
  rail with a restore affordance.
- [ ] **Step 5: `WorkspaceTabBar.tsx`** — port design `1726–1756`: fixed-height tab row whose seam
  aligns with the side-chat header; tabs for files plus the special tabs `__chat`, `__doc`,
  `__legal` (design `3557–3567`); active tab takes `bg-canvas` + `border-float-line`; close `×`
  per tab; `+` affordance.
- [ ] **Step 6: `WorkspaceDocs.tsx`** — single-document pane for now (split arrives in Task 12),
  rendering the design's document preview for the active file, plus the **no tabs open** empty
  state (`1934`).
- [ ] **Step 7:** Replace the Task 8 placeholder in `[id]/page.tsx` with `WorkspaceShell`.
- [ ] **Step 8:** Eyes-on both locales: open Tigbur, open/close tabs, open each of the four detail
  bodies, collapse and restore the panel.
- [ ] **Step 9:** `npm test` · `npx tsc --noEmit` · `npm run build`.
- [ ] **Step 10: Commit** `git commit -am "feat(surfaces-import): workspace control shell"`

---

### Task 10: Working document

**Files:** Create `src/components/workspace/WorkingDocument.tsx`

- [ ] **Step 1:** Port design `1802–1887`: title, `Last edited … · N citations · v4` meta line,
  body prose, the citation quote block, and the Open-questions list.
- [ ] **Step 2: Toolbar** (design `3664–3671`): H · B · I · • · " · ⤷ with the exact `title`
  attributes from the design. Each applies formatting to the current selection inside the
  `contentEditable` body via `document.execCommand` (deprecated but universally supported and
  dependency-free; the spec rejected an editor library this chapter). `⤷ Cite a source` inserts a
  citation block pre-marked with `<DemoInline />`.
- [ ] **Step 3:** `Continue this section` inserts one clearly-marked demo paragraph — it must be
  obvious no model produced it (no backend this chapter).
- [ ] **Step 4:** Autosave label — `Saved just now` after an edit settles; content persists to
  `setDocHtml(workspaceId, html)` so switching tabs and returning keeps the text. Reload clears it.
- [ ] **Step 5: Export** (design `3672–3675`) — menu with `Export as PDF` / `Export as Word`.
  PDF calls `window.print()` (rules/app.md: Hebrew needs a real browser engine). Word is **not**
  implemented this chapter: render it disabled with a "not in this build" hint rather than a
  button that silently does nothing.
- [ ] **Step 6:** The citation block carries `<DemoInline />`; `<DemoBanner />` is already on the
  page from Task 8/9.
- [ ] **Step 7:** Eyes-on: type into the document, apply each toolbar action, switch tab and
  return, reload and confirm reset. Hebrew: RTL text direction inside the editable area.
- [ ] **Step 8:** `npm test` · `npx tsc --noEmit`.
- [ ] **Step 9: Commit** `git commit -am "feat(surfaces-import): working document with live editing"`

---

### Task 11: Legal due-diligence + legal agent chat

**Files:** Create `src/components/workspace/LegalDueDiligence.tsx`, `LegalAgentChat.tsx`

- [ ] **Step 1: Scoping stage** — port design `1489–1526`: the guidance copy plus the four area
  chips from `LEGAL_AREAS` (Litigation · Regulatory · Contracts & liens · Ownership & control),
  toggling black-on-selected (design `3643–3646`), and the scope line — `Scope: A · B` when any
  are selected, otherwise `Full review — no scope narrowing` (design `3661`).
- [ ] **Step 2: Running stage** — port design `1527–1545`: the five `LEGAL_STEPS` with
  done/running/waiting states and their three ink colours (design `3648–3650`). Steps advance on
  user action, not on a fabricated timer.
- [ ] **Step 3: Findings** — the six `LEGAL_FINDINGS` with severity pills Flag/Medium/Clear in the
  design's exact colours (design `3652`) and the `src` line under each. **Every finding row
  carries `<DemoInline />`** — non-negotiable per spec §2.1.
- [ ] **Step 4: `LegalAgentChat.tsx`** — port design `1888–1933`: opens as the `__legal` tab on the
  findings, agent lead line then the findings as chat content.
- [ ] **Step 5:** Wire the panel's `Legal Due-Diligence` row (`Deploy a legal agent across every
  file`) to open the `__legal` tab.
- [ ] **Step 6:** Eyes-on both locales; confirm severity colours match the design probe.
- [ ] **Step 7:** `npm test` · `npx tsc --noEmit`.
- [ ] **Step 8: Commit** `git commit -am "feat(surfaces-import): legal due-diligence + legal agent chat"`

---

### Task 12: Split docs, drag gutters, side-chat and ask dock

**Files:** Modify `WorkspaceDocs.tsx`, `WorkspaceShell.tsx`, `WorkspaceTabBar.tsx`

- [ ] **Step 1: Split mode** — port design `1942–2008`: when split is on, the tabs marked into the
  multi set render side by side, each with a flex weight (design `3573–3582`).
- [ ] **Step 2: Drag gutters** — the hairline between documents is the drag handle: 1px at rest,
  2px and darker (`#B7B1A4`) on hover or drag; dragging adjusts the neighbouring flex weights;
  double-click resets. Use pointer events with `setPointerCapture`, and **guard the capture call**
  — an unguarded `setPointerCapture` was a real bug in the Pinge work.
- [ ] **Step 3: Tab-bar split affordances** — `+`/`×` per tab to add or remove it from the multi
  set while split is on (design `3543–3545`).
- [ ] **Step 4: Workspace chat tab** — port design `1757–1801`: the `__chat` tab renders the
  workspace's own agent as **the existing Ask Atlas side-chat component**, not a second copy
  (design `2039` calls it "the standard side-chat"). Reuse the existing marking/highlight
  components for in-document selection rather than importing the design's copy.
- [ ] **Step 5:** Eyes-on: open two files, split, drag the gutter both directions, reset, close one.
- [ ] **Step 6:** `npm test` · `npx tsc --noEmit`.
- [ ] **Step 7: Commit** `git commit -am "feat(surfaces-import): split docs, drag gutters, workspace side-chat"`

---

### Task 13: Locales, parity probes, evidence

**Files:** Create `docs/evidence/feat-surfaces-import/2026-08-01-three-surfaces-verification.md`
and its `probe/` + screenshots

- [ ] **Step 1: Locale sweep** — walk all three surfaces in Hebrew: `dir="rtl"` correct, every
  number/ticker/count `font-mono-num` + `dir="ltr"`, no clipped or mirrored glyphs, the demo
  banner readable in both. Fix what the sweep finds.
- [ ] **Step 2: Parity probes** — serve `design-import/` on `:4321`, probe computed styles for the
  frame first (page bg, panel float border/radius/shadow, rail), then per surface: card fills,
  hairlines, type sizes/weights, the severity colours, the tab-bar seam height. Write the merged
  result to `docs/evidence/feat-surfaces-import/probe/surfaces-tokens.json`. **Probe the rendered
  design, never bundle CSS.** Foreground the tab before believing any size probe — a backgrounded
  tab returns stale layout.
- [ ] **Step 3: Fix diffs** the probes surface, re-probe until they agree, keeping the deliberate
  `railText #85817A` deviation.
- [ ] **Step 4: Durable screenshots** — EN + HE for: projects list, a project, agents page, agent
  dock, workspace picker, intake, control shell, working document, legal findings, split docs.
  Use Playwright (`page.screenshot({ path })`, locale via the `locale` cookie) so the files are
  real and committed — Chrome MCP screenshots alone expire with the transcript.
- [ ] **Step 5: Write the evidence file.** Every caption states what is **in the frame** and what
  the artifact does **not** show. Record: the demo-marking audit (one line per surface confirming
  the marker is present in both locales), the reuse decisions, and any design divergence with its
  reason.
- [ ] **Step 6: Full battery** — `npm test` · `npx tsc --noEmit` · `npm run build` (dev stopped).
- [ ] **Step 7: Commit** `git commit -am "docs(surfaces-import): parity probes + both-locale evidence"`

---

## Self-Review

**Spec coverage.** §3.1 routes → Tasks 3, 8, 9. §3.2 ChatView prop → Task 3 Step 1. §3.3 provider
→ Task 1. §3.4 reuse → Task 12 Step 4. §3.5 stub layer → Tasks 2, 4, 7. §4 inventory: Projects →
Tasks 2–3; Workspace picker/empty/intake → Task 8; control shell/detail/collapsed/tab bar/no-tabs
→ Task 9; document → Task 10; legal → Task 11; split/gutters/side-chat/ask dock → Task 12. Agents
command deck/grid/finished/scheduled → Task 5; create + dock → Task 6. §5 document → Task 10.
§6 verification → Task 13 plus per-task eyes-on. §2.1 demo marking → Task 1, applied in Tasks 3,
5, 6, 8, 10, 11.

**Placeholder scan.** No TBDs. The one deferred item is explicit and visible to the user, not
silent: Export-as-Word renders disabled with a hint (Task 10 Step 5). The Task 8 shell placeholder
is replaced in Task 9 Step 7.

**Type consistency.** `Project`/`ContextItem`/`ProjectChat` (Task 2) are consumed unchanged in
Tasks 1 and 3. `AgentCard` (Task 4) keeps its existing `domain` field so the Task 5 grid and the
2026-07-14 test both still compile. `Workspace` (Task 7) extends the existing type additively —
`fileCount` and `subtitle` are retained so `WorkspacePicker` keeps working before Task 8 touches
it. `useDemoState()` method names (`addProject`, `patchProject`, `addAgent`, `addWorkspace`,
`setDocHtml`) are used verbatim in Tasks 3, 6, 8, 10.
