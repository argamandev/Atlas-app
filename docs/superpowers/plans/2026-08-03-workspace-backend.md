# Workspace Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Workspace persist — a signed-in user creates a workspace, puts real transcripts and corpus documents in it, writes a working document with citations that point at real lines, closes the browser, comes back, and it is all still there and invisible to every other account.

**Architecture:** Four owned tables (`workspaces`, `workspace_items`, `workspace_threads`, `workspace_doc_blocks`) behind one DB module that queries through the **caller's own** Supabase client so RLS is load-bearing. Pure modules (`validate`, `derive`, `present`) hold every rule that can be unit-tested without a database; routes are thin. Layout (`is_open`, `position`) is stored data returned by the same GET that returns the workspace, so the first server paint is the room as it was left.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (PostgreSQL 17.6) · `node:test` via `tsx` · Tailwind

**Spec:** `docs/superpowers/specs/2026-08-03-workspace-backend-design.md`

## Global Constraints

- **Branch:** `feat/workspace-tables`, off `c27995a`. **Never push `main`** (hook-blocked). Finish via `/ship`, append to the ready queue.
- **The database is shared with deployed production Timlul.** Additive-only. `DROP`/`TRUNCATE`/destructive `ALTER` are hook-blocked on both doors.
- **DDL is reviewed as a FILE before it is applied.** Write the migration → push → reviewer reads the file → founder rules → append to `agent-memory/cross-cutting.md` → *then* apply. Task 1 must not be applied by the engineer implementing it.
- **Ownership law, all four at `CREATE TABLE`:** real FK `references auth.users (id) on delete cascade`; `enable row level security`; policy `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)`; index on `user_id`.
- **Never `supabaseAdmin` in this chapter.** Every query goes through `createServerSupabase(cookies())`. The service-role key bypasses RLS.
- **Never `auth.getSession()`.** Use `resolveUser` from `src/lib/auth/verifyUser.ts`. `git grep -n "auth\.getSession()" -- src` must keep returning nothing.
- **Every API handler must bind its auth result and act on it**, or `src/lib/apiAuthBoundary.test.ts` fails — it auto-discovers handlers, so new routes are covered the moment they exist:
  ```ts
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  ```
- **`npm test` runs an EXPLICIT LIST in `package.json`.** A new `*.test.ts` that is not added to that list **silently never runs**. Every task that creates a test file also edits `package.json`.
- **Store facts, derive labels.** No `updated_label`, `initial`, `subtitle`, `file_count` columns. `'2h ago'` is computed at render.
- **RTL discipline (iron rule 5):** alignment is physical (`ml-auto`, `rounded-br`); direction is not (`dir="auto"` / `<bdi>` stay). A line mixing Hebrew and Latin gets `<bdi>` **per run**, never `dir` on the line. Every UI string lands in **both** `src/lib/i18n/dictionaries/en.ts` and `he.ts`.
- **Never run `npm run build` while a dev server is up in this checkout** — they share `.next`.
- Dev port for this lane is **3003** (`npm run dev -- -p 3003`).
- 5-strike rule: ~5 failed attempts at the same problem → stop, append an `ALERT` to `agent-memory/cross-cutting.md`, escalate.

## Scope Boundary — read before Task 11

The **backend** persists N open sources with an order. The **existing UI centres one** source (`WsFile.live`). Rendering several genuinely side by side is a frontend change and is **not** in this chapter; Task 11 wires the persisted state so reopening restores what was centred, and the multi-pane view is flagged as the frontend follow-on.

Also out of scope, and their demo constants stay put with their existing demo markers: `WS_AGENT_PROFILES`, `SYSTEM_AGENTS`, `WS_SESSIONS`, `LEGAL_AREAS`, `LEGAL_STEPS`, `LEGAL_FINDINGS`, `LEGAL_SEVERITY_STYLE`, `workspaceSessions()`. Agent execution needs the deploy, which comes after this chapter.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260803_016_workspaces.sql` | the four tables, RLS, policies, indexes |
| `src/lib/workspace/data.ts` | display shapes **and** row shapes; loses its demo workspaces in Task 11 |
| `src/lib/workspace/validate.ts` (+ test) | request-body validation, pure |
| `src/lib/time/relative.ts` (+ test) | `relativeLabel` extracted so Workspace does not import from Projects |
| `src/lib/workspace/present.ts` (+ test) | rows → display shapes; citation state; pure |
| `src/lib/db/workspaces.ts` | the only module touching the four tables; user client throughout |
| `src/app/api/workspaces/**` | thin routes in the auth-boundary shape |
| `src/lib/workspace/client.ts` | the browser's only door to the API |
| `src/components/workspace/*` | swapped from stub to real data |

---

### Task 1: The migration file — written, NOT applied

**Files:**
- Create: `supabase/migrations/20260803_016_workspaces.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `workspaces(id, user_id, name, doc_title, created_at, updated_at)`, `workspace_items(id, workspace_id, user_id, transcript_id, document_id, storage_path, name, kind, is_open, position, created_at)`, `workspace_threads(id, workspace_id, user_id, title, messages, created_at, updated_at)`, `workspace_doc_blocks(id, workspace_id, user_id, kind, body, position, source_item_id, source_label, source_page, source_line_id, source_quote, created_at, updated_at)`.

**⚠️ This task ends at "committed and pushed". Do NOT run `apply_migration`.** Applying before review inverts the one gate that cannot be undone: narrowing a policy afterwards needs `DROP POLICY`/`ALTER POLICY`, both hook-blocked on this shared database.

- [ ] **Step 1: Write the migration file**

```sql
-- 20260803_016_workspaces.sql
-- Workspace backend: persistence + ownership.
-- Personal-layer data per docs/DATA-MODEL.md — one owner, never shared.
-- Spec: docs/superpowers/specs/2026-08-03-workspace-backend-design.md
--
-- ADDITIVE ONLY. Reviewed as a FILE before application per .claude/rules/db.md:
-- narrowing a policy afterwards needs DROP/ALTER, both hook-blocked, so a
-- reviewer verdict of "narrow that policy" is unactionable once it is live.
--
-- Ownership law (.claude/rules/db.md), all four points at CREATE TABLE:
--   1. real FK to auth.users(id) ON DELETE CASCADE
--   2. ENABLE ROW LEVEL SECURITY
--   3. owner policy on BOTH using and with-check, granted to `authenticated`
--   4. index on user_id

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  -- The working document's title. One document per workspace, so it lives here
  -- rather than in a table of one row.
  doc_title   text not null default '',
  created_at  timestamptz not null default now(),
  -- Moves on CONTENT change (item attached/removed, block written, name or
  -- doc_title edited) and NOT on a pure layout change (is_open, position).
  -- Pane drags are frequent and debounced; if they bumped this, the derived
  -- "edited 2h ago" would quietly mean "looked at 2h ago".
  updated_at  timestamptz not null default now(),
  -- NOT redundant with the primary key: a foreign key must reference a uniquely
  -- constrained column SET, and all three child tables reference the pair.
  constraint workspaces_id_user_id_key unique (id, user_id)
);

-- ── The shelf ───────────────────────────────────────────────────────────────
--
-- THREE provenances, not two (founder clarification 2026-08-03): a workspace
-- holds investor-call TRANSCRIPTS as well as Maya/corpus documents and private
-- files. That is also what makes it useful today — 60 transcripts exist against
-- 2 corpus documents, so a document-only shelf would sit empty until Maya lands.
--
-- transcript_id is TEXT because transcripts.id is text, verified against the
-- live database 2026-08-03. A uuid column would fail this FK outright, and
-- "fixing" that by dropping the FK is exactly the bad half of the schema that
-- .claude/rules/db.md warns about.
--
-- ⚠️ THE CORPUS CASCADE, stated because it destroys something.
--   The ACCOUNT is removed   -> its workspaces and everything in them go. Right.
--   A WORKSPACE is removed   -> its items go. Right.
--   A CORPUS ROW is removed  -> the item vanishes from EVERY user's shelf,
--                               silently, with no UI having said so.
-- What protects the thing that matters: workspace_doc_blocks references the
-- ITEM with `on delete set null`, so the user's WRITING survives its source
-- vanishing and the citation renders as visibly broken. Corpus rows are removed
-- only by an admin/script path and Atlas ships no such UI. The alternative,
-- `on delete restrict`, makes corpus maintenance fail loudly whenever any user
-- holds the row — more honest, operationally worse.
create table if not exists public.workspace_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid not null references auth.users (id) on delete cascade,

  transcript_id text references public.transcripts (id)         on delete cascade,
  document_id   uuid references public.company_documents (id)   on delete cascade,
  storage_path  text,

  name          text not null,
  kind          text not null check (kind in ('transcript','document','file')),
  -- Side-by-side survives the browser closing, and so does the order.
  -- position orders ALL items, not only the open ones: a closed source keeps
  -- its place, so reopening restores it rather than appending it to the end.
  is_open       boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint workspace_items_one_source
    check (num_nonnulls(transcript_id, document_id, storage_path) = 1),

  -- COMPOSITE, and that is a security property rather than bookkeeping:
  -- PostgreSQL referential-integrity checks DELIBERATELY BYPASS RLS, so a plain
  -- workspace_id -> workspaces(id) key validates happily against a stranger's
  -- workspace that RLS makes invisible. user_id in the key is what makes
  -- "attach my item to someone else's workspace" fail in the DATABASE.
  constraint workspace_items_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade,

  -- Referenced by workspace_doc_blocks below, same reason as on workspaces.
  constraint workspace_items_id_user_id_key unique (id, user_id)
);

-- The corpus FKs above are deliberately NOT composite: transcripts and
-- company_documents are shared corpus (docs/DATA-MODEL.md) with no owner to
-- match against, and every member may legitimately read them. A plain FK still
-- does the job that matters — the column cannot hold an id that does not exist.

create table if not exists public.workspace_threads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null default '',
  -- Inline jsonb, matching chat_conversations. NOTE the consequence: a cascade
  -- takes the whole history with the row rather than unlinking it, which is why
  -- countWorkspaceContents() exists and why the delete path must show the count.
  messages      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint workspace_threads_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade
);

-- ── The working document ────────────────────────────────────────────────────
create table if not exists public.workspace_doc_blocks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('heading','text','quote')),
  body            text not null default '',
  position        integer not null default 0,

  source_item_id  uuid,
  -- Snapshot, e.g. 'תדיראן Q4 2025 · 00:12:31'. Makes an absent source
  -- INFORMATIVE rather than a dangling marker.
  source_label    text,
  source_page     integer,   -- a document page
  source_line_id  text,      -- a transcript line, e.g. 'L0001'
  -- Snapshot of the quoted words. formatted_data is regenerated when a
  -- transcript is re-processed through Gemini, so L0004 can come back meaning a
  -- different sentence: the citation would still RESOLVE, to the wrong words.
  -- Comparing this against what the anchor resolves to today is what lets the
  -- UI render "drifted" instead of a plausible-looking lie.
  source_quote    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint workspace_doc_blocks_one_anchor
    check (num_nonnulls(source_page, source_line_id) <= 1),
  constraint workspace_doc_blocks_quote_has_text
    check (kind <> 'quote' or source_quote is not null),

  constraint workspace_doc_blocks_workspace_fk
    foreign key (workspace_id, user_id)
    references public.workspaces (id, user_id) on delete cascade,

  -- SET NULL, NEVER CASCADE — the load-bearing decision of this table.
  -- Removing a source from the shelf must not delete the user's writing. The
  -- surviving block with a null source_item_id IS the "visibly absent" state.
  -- The column list is named explicitly because an unqualified composite
  -- set-null would try to null user_id too, which is NOT NULL — that fails at
  -- DELETE time, not at migration time. Requires PG15+; this database is 17.6.
  constraint workspace_doc_blocks_item_fk
    foreign key (source_item_id, user_id)
    references public.workspace_items (id, user_id)
    on delete set null (source_item_id)
);

alter table public.workspaces           enable row level security;
alter table public.workspace_items      enable row level security;
alter table public.workspace_threads    enable row level security;
alter table public.workspace_doc_blocks enable row level security;

-- `for all` + both sides + `to authenticated`. A using-only policy would let a
-- row be written to someone else's id; granting to `public` would expose the
-- table to anyone holding the anon key, which ships in the browser bundle.
-- CREATE POLICY has no IF NOT EXISTS, so these are guarded to keep the file
-- re-runnable — a partially-applied migration must be replayable, and the
-- cleanup would otherwise need hook-blocked SQL.
do $$
declare
  t text;
begin
  foreach t in array array['workspaces','workspace_items','workspace_threads','workspace_doc_blocks']
  loop
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t
                     and policyname = t || '_owner') then
      execute format(
        'create policy %I on public.%I for all to authenticated
           using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t || '_owner', t);
    end if;
  end loop;
end $$;

create index if not exists workspaces_user_id_idx
  on public.workspaces (user_id);
create index if not exists workspace_items_user_id_idx
  on public.workspace_items (user_id);
create index if not exists workspace_items_workspace_id_idx
  on public.workspace_items (workspace_id);
create index if not exists workspace_threads_user_id_idx
  on public.workspace_threads (user_id);
create index if not exists workspace_threads_workspace_id_idx
  on public.workspace_threads (workspace_id);
create index if not exists workspace_doc_blocks_user_id_idx
  on public.workspace_doc_blocks (user_id);
create index if not exists workspace_doc_blocks_workspace_id_idx
  on public.workspace_doc_blocks (workspace_id);
create index if not exists workspace_doc_blocks_source_item_id_idx
  on public.workspace_doc_blocks (source_item_id);

-- The same source cannot sit on one shelf twice.
create unique index if not exists workspace_items_transcript_uniq
  on public.workspace_items (workspace_id, transcript_id) where transcript_id is not null;
create unique index if not exists workspace_items_document_uniq
  on public.workspace_items (workspace_id, document_id) where document_id is not null;
```

- [ ] **Step 2: Verify it was NOT applied**

Run:
```bash
git status --porcelain supabase/migrations/
```
Expected: the new file shows as untracked/added. Then confirm no table exists yet — ask the supervisor to run `list_tables`, or leave it to the review gate. **Do not call `apply_migration`.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260803_016_workspaces.sql
git commit -m "feat(db): workspace tables — migration FILE, not applied

Four owned tables behind the ownership law. transcript_id is text because
transcripts.id is text. Citations survive their source via a column-scoped
ON DELETE SET NULL. Awaiting the DDL gate: reviewer on the file, then the
founder's ruling on the corpus cascade, then cross-cutting, then apply."
```

- [ ] **Step 4: Push and hand to the gate**

```bash
git push -u origin feat/workspace-tables
```
Then append a review request to `agent-memory/ready-queue.md` via `node scripts/append-log.mjs ready-queue` (stdin form — it takes **no** text argument).

**STOP HERE until the founder rules on the corpus cascade and the migration is applied.** Tasks 2–4 are pure and may proceed in parallel; Task 5 onward needs the tables.

---

### Task 2: Row and display types

**Files:**
- Modify: `src/lib/workspace/data.ts` (append types only — the demo data stays until Task 11, so every commit is green)

**Interfaces:**
- Consumes: nothing.
- Produces: `WorkspaceRow`, `WorkspaceItemRow`, `WorkspaceThreadRow`, `WorkspaceBlockRow`, `WsItemKind`, `WsBlockKind`, `CitationState`.

- [ ] **Step 1: Append the row shapes**

```ts
// ── Row shapes, exactly as migration 016 defines them ────────────────────────

export type WsItemKind = 'transcript' | 'document' | 'file'
export type WsBlockKind = 'heading' | 'text' | 'quote'

/** live | drifted | absent — see citationState() in ./present */
export type CitationState = 'live' | 'drifted' | 'absent'

export type WorkspaceRow = {
  id: string
  user_id: string
  name: string
  doc_title: string
  created_at: string
  updated_at: string
}

export type WorkspaceItemRow = {
  id: string
  workspace_id: string
  user_id: string
  transcript_id: string | null
  document_id: string | null
  storage_path: string | null
  name: string
  kind: WsItemKind
  is_open: boolean
  position: number
  created_at: string
}

export type WorkspaceThreadRow = {
  id: string
  workspace_id: string
  user_id: string
  title: string
  messages: unknown[]
  created_at: string
  updated_at: string
}

export type WorkspaceBlockRow = {
  id: string
  workspace_id: string
  user_id: string
  kind: WsBlockKind
  body: string
  position: number
  source_item_id: string | null
  source_label: string | null
  source_page: number | null
  source_line_id: string | null
  source_quote: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workspace/data.ts
git commit -m "feat(workspace): row shapes for migration 016"
```

---

### Task 3: Request validation, pure and tested

**Files:**
- Create: `src/lib/workspace/validate.ts`
- Test: `src/lib/workspace/validate.test.ts`
- Modify: `package.json` (add the test file to the `test` script)

**Interfaces:**
- Consumes: `WsItemKind`, `WsBlockKind` from `./data`.
- Produces: `parseWorkspaceCreate(body): Parsed<{name: string}>`, `parseWorkspacePatch(body): Parsed<Partial<{name: string; doc_title: string}>>`, `parseItemCreate(body): Parsed<ItemCreate>`, `parseItemPatch(body): Parsed<Partial<{is_open: boolean; position: number}>>`, `parseBlockCreate(body): Parsed<BlockCreate>`, `parseBlockPatch(body): Parsed<Partial<{body: string; position: number}>>`, and constants `WS_NAME_MAX = 200`, `WS_BODY_MAX = 20_000`.
- `ItemCreate = { kind: WsItemKind; name: string; transcript_id?: string; document_id?: string; storage_path?: string }`
- `BlockCreate = { kind: WsBlockKind; body: string; position: number; source_item_id?: string; source_label?: string; source_page?: number; source_line_id?: string; source_quote?: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWorkspaceCreate, parseWorkspacePatch, parseItemCreate,
  parseItemPatch, parseBlockCreate, WS_NAME_MAX,
} from './validate'

test('a workspace needs a non-empty name', () => {
  assert.equal(parseWorkspaceCreate({ name: '' }).ok, false)
  assert.equal(parseWorkspaceCreate({ name: '   ' }).ok, false)
  assert.equal(parseWorkspaceCreate(null).ok, false)
  assert.equal(parseWorkspaceCreate({ name: 'a'.repeat(WS_NAME_MAX + 1) }).ok, false)
  const ok = parseWorkspaceCreate({ name: '  Tigbur  ' })
  assert.equal(ok.ok && ok.value.name, 'Tigbur')
})

test('ownership cannot be reassigned through a patch', () => {
  assert.equal(parseWorkspacePatch({ user_id: 'someone-else' }).ok, false)
  assert.equal(parseWorkspacePatch({}).ok, false)
})

test('an item carries EXACTLY ONE provenance', () => {
  // The DB has a CHECK for this; refusing here turns a 500 into a 400.
  assert.equal(parseItemCreate({ kind: 'transcript', name: 'x' }).ok, false)
  assert.equal(
    parseItemCreate({ kind: 'transcript', name: 'x', transcript_id: 't1', document_id: 'd1' }).ok,
    false
  )
  const ok = parseItemCreate({ kind: 'transcript', name: 'Q4 call', transcript_id: 't1' })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.transcript_id, 't1')
})

test('the provenance must MATCH the declared kind', () => {
  // A row claiming to be a transcript while holding a document id would render
  // with the wrong icon and resolve its citations against the wrong source.
  assert.equal(parseItemCreate({ kind: 'transcript', name: 'x', document_id: 'd1' }).ok, false)
  assert.equal(parseItemCreate({ kind: 'document', name: 'x', transcript_id: 't1' }).ok, false)
  assert.equal(parseItemCreate({ kind: 'file', name: 'x', transcript_id: 't1' }).ok, false)
})

test('layout is the only thing an item patch may change', () => {
  assert.equal(parseItemPatch({ transcript_id: 'other' }).ok, false)
  assert.equal(parseItemPatch({ position: -1 }).ok, false)
  assert.equal(parseItemPatch({ position: 1.5 }).ok, false)
  const ok = parseItemPatch({ is_open: true, position: 3 })
  assert.deepEqual(ok.ok && ok.value, { is_open: true, position: 3 })
})

test('a quote block without its quoted text is refused', () => {
  // Mirrors the DB CHECK: without the snapshot there is nothing to detect
  // drift against, so the citation could later resolve to the wrong words.
  assert.equal(parseBlockCreate({ kind: 'quote', body: 'x', position: 0 }).ok, false)
  const ok = parseBlockCreate({
    kind: 'quote', body: 'x', position: 0,
    source_quote: 'הכנסות עלו', source_line_id: 'L0004', source_item_id: 'i1',
  })
  assert.equal(ok.ok, true)
})

test('a block anchors to a page OR a line, never both', () => {
  assert.equal(
    parseBlockCreate({
      kind: 'quote', body: 'x', position: 0, source_quote: 'q',
      source_page: 14, source_line_id: 'L0004',
    }).ok,
    false
  )
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/workspace/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 3: Implement `validate.ts`**

Hand-rolled, matching `src/lib/projects/validate.ts` (not zod — see its header comment).

```ts
import type { WsItemKind, WsBlockKind } from './data'

// Request-body validation for the workspace routes. Pure, so it is testable
// without booting Next. Every rule here that mirrors a database CHECK exists to
// turn a 500 into a 400 with a sentence the UI can render.

export const WS_NAME_MAX = 200
export const WS_BODY_MAX = 20_000

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const isIndex = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0

function name(v: unknown): Parsed<string> {
  const n = str(v)?.trim()
  if (!n) return { ok: false, error: 'name is required' }
  if (n.length > WS_NAME_MAX) return { ok: false, error: `name exceeds ${WS_NAME_MAX} characters` }
  return { ok: true, value: n }
}

export function parseWorkspaceCreate(body: unknown): Parsed<{ name: string }> {
  const n = name((body as { name?: unknown } | null)?.name)
  return n.ok ? { ok: true, value: { name: n.value } } : n
}

export function parseWorkspacePatch(
  body: unknown
): Parsed<Partial<{ name: string; doc_title: string }>> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Partial<{ name: string; doc_title: string }> = {}
  if (b.name !== undefined) {
    const n = name(b.name)
    if (!n.ok) return n
    out.name = n.value
  }
  if (b.doc_title !== undefined) {
    const t = str(b.doc_title)
    if (t === null) return { ok: false, error: 'doc_title must be a string' }
    if (t.length > WS_NAME_MAX) return { ok: false, error: `doc_title exceeds ${WS_NAME_MAX} characters` }
    out.doc_title = t
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

export type ItemCreate = {
  kind: WsItemKind
  name: string
  transcript_id?: string
  document_id?: string
  storage_path?: string
}

const KIND_FIELD: Record<WsItemKind, 'transcript_id' | 'document_id' | 'storage_path'> = {
  transcript: 'transcript_id',
  document: 'document_id',
  file: 'storage_path',
}

export function parseItemCreate(body: unknown): Parsed<ItemCreate> {
  const b = (body ?? {}) as Record<string, unknown>
  const kind = str(b.kind) as WsItemKind | null
  if (!kind || !(kind in KIND_FIELD)) {
    return { ok: false, error: 'kind must be transcript, document or file' }
  }
  const n = name(b.name)
  if (!n.ok) return n

  const fields = ['transcript_id', 'document_id', 'storage_path'] as const
  const supplied = fields.filter((f) => str(b[f])?.trim())
  if (supplied.length !== 1) {
    return { ok: false, error: 'an item needs exactly one of transcript_id, document_id, storage_path' }
  }
  // A row claiming one kind while holding another's id would render the wrong
  // icon and resolve its citations against the wrong source.
  if (supplied[0] !== KIND_FIELD[kind]) {
    return { ok: false, error: `kind "${kind}" does not match ${supplied[0]}` }
  }
  return { ok: true, value: { kind, name: n.value, [supplied[0]]: str(b[supplied[0]])!.trim() } }
}

export function parseItemPatch(
  body: unknown
): Parsed<Partial<{ is_open: boolean; position: number }>> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Partial<{ is_open: boolean; position: number }> = {}
  if (b.is_open !== undefined) {
    if (typeof b.is_open !== 'boolean') return { ok: false, error: 'is_open must be a boolean' }
    out.is_open = b.is_open
  }
  if (b.position !== undefined) {
    if (!isIndex(b.position)) return { ok: false, error: 'position must be a non-negative integer' }
    out.position = b.position
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

export type BlockCreate = {
  kind: WsBlockKind
  body: string
  position: number
  source_item_id?: string
  source_label?: string
  source_page?: number
  source_line_id?: string
  source_quote?: string
}

export function parseBlockCreate(body: unknown): Parsed<BlockCreate> {
  const b = (body ?? {}) as Record<string, unknown>
  const kind = str(b.kind) as WsBlockKind | null
  if (!kind || !['heading', 'text', 'quote'].includes(kind)) {
    return { ok: false, error: 'kind must be heading, text or quote' }
  }
  const text = str(b.body) ?? ''
  if (text.length > WS_BODY_MAX) return { ok: false, error: `body exceeds ${WS_BODY_MAX} characters` }
  const position = b.position === undefined ? 0 : b.position
  if (!isIndex(position)) return { ok: false, error: 'position must be a non-negative integer' }

  const quote = str(b.source_quote)?.trim()
  // Mirrors the DB CHECK: without the snapshot there is nothing to detect drift
  // against, so the citation could later resolve to the wrong words silently.
  if (kind === 'quote' && !quote) {
    return { ok: false, error: 'a quote block must carry the quoted text' }
  }

  const page = b.source_page
  const line = str(b.source_line_id)?.trim()
  if (page !== undefined && page !== null && line) {
    return { ok: false, error: 'a block anchors to a page or a line, not both' }
  }
  if (page !== undefined && page !== null && !isIndex(page)) {
    return { ok: false, error: 'source_page must be a non-negative integer' }
  }

  const out: BlockCreate = { kind, body: text, position }
  const item = str(b.source_item_id)?.trim()
  if (item) out.source_item_id = item
  const label = str(b.source_label)?.trim()
  if (label) out.source_label = label
  if (page !== undefined && page !== null) out.source_page = page as number
  if (line) out.source_line_id = line
  if (quote) out.source_quote = quote
  return { ok: true, value: out }
}

export function parseBlockPatch(
  body: unknown
): Parsed<Partial<{ body: string; position: number }>> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Partial<{ body: string; position: number }> = {}
  if (b.body !== undefined) {
    const v = str(b.body)
    if (v === null) return { ok: false, error: 'body must be a string' }
    if (v.length > WS_BODY_MAX) return { ok: false, error: `body exceeds ${WS_BODY_MAX} characters` }
    // An empty body is legitimate — clearing a block is a real edit.
    out.body = v
  }
  if (b.position !== undefined) {
    if (!isIndex(b.position)) return { ok: false, error: 'position must be a non-negative integer' }
    out.position = b.position
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}
```

- [ ] **Step 4: Register the test file — it will not run otherwise**

In `package.json`, append ` src/lib/workspace/validate.test.ts` to the end of the `test` script string.

- [ ] **Step 5: Run the whole battery**

Run: `npm test`
Expected: all pass, and the total count has grown by the new tests. `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workspace/validate.ts src/lib/workspace/validate.test.ts package.json
git commit -m "feat(workspace): request validation, mirroring the DB checks"
```

---

### Task 4: Shared relative-time helper + presentation, pure and tested

**Files:**
- Create: `src/lib/time/relative.ts`
- Modify: `src/lib/projects/derive.ts` (re-export, so nothing downstream changes)
- Create: `src/lib/workspace/present.ts`
- Test: `src/lib/workspace/present.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorkspaceRow`, `WorkspaceItemRow`, `WorkspaceBlockRow`, `CitationState` from `./data`; `Dictionary` from `@/lib/i18n/dictionaries/en`.
- Produces: `relativeLabel(iso, now, locale)` and `type Locale = 'en' | 'he'` from `@/lib/time/relative`; `citationState(block, resolvedText)`, `workspaceInitial(name)`, `presentWorkspace(row, items, companyNames, now, locale, dict)` from `./present`.

**Why the extraction:** `relativeLabel` lives in `src/lib/projects/derive.ts` today. Workspace needs the identical rule, and importing a time helper *from Projects* is a boundary a reviewer would rightly reject. Move it, re-export it, change no caller.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { citationState, workspaceInitial, deriveCompany } from './present'
import en from '@/lib/i18n/dictionaries/en'

const block = (over: Record<string, unknown> = {}) => ({
  source_item_id: 'i1' as string | null,
  source_quote: 'הכנסות עלו בכל שנה' as string | null,
  source_page: null as number | null,
  source_line_id: 'L0004' as string | null,
  ...over,
})

test('a citation whose source was removed is ABSENT, never live', () => {
  assert.equal(citationState(block({ source_item_id: null }), null), 'absent')
  assert.equal(citationState(block(), null), 'absent')
})

test('a citation resolving to the words it quoted is LIVE', () => {
  assert.equal(citationState(block(), 'ובכן, הכנסות עלו בכל שנה מאז 2022'), 'live')
})

test('a re-processed transcript that moved the line renders DRIFTED, not live', () => {
  // The anchor still resolves — to a DIFFERENT sentence. This is the whole
  // reason source_quote is stored: without it this case is indistinguishable
  // from a correct citation, which is the "plausible-looking, not absent"
  // failure the lane rules name.
  assert.equal(citationState(block(), 'שאלה לגבי המרווח התפעולי'), 'drifted')
})

test('whitespace differences are not drift', () => {
  assert.equal(citationState(block(), 'הכנסות   עלו\n בכל שנה'), 'live')
})

test('the avatar initial survives an emoji and a Hebrew letter', () => {
  // Naive name[0] splits a surrogate pair and renders a replacement glyph.
  assert.equal(workspaceInitial('⚓ Shipping scan'), '⚓')
  assert.equal(workspaceInitial('תגבור — הפרטה'), 'ת')
  assert.equal(workspaceInitial('   '), '+')
})

test('a workspace over several companies says so rather than naming one', () => {
  assert.equal(deriveCompany([], en), en.workspace.companyNone)
  assert.equal(deriveCompany(['Tigbur Group'], en), 'Tigbur Group')
  assert.equal(deriveCompany(['Tigbur Group', 'Tigbur Group'], en), 'Tigbur Group')
  assert.equal(
    deriveCompany(['Tigbur Group', 'Qualitau', 'ZIM'], en),
    en.workspace.companyMany.replace('{n}', '3')
  )
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --import tsx --test src/lib/workspace/present.test.ts`
Expected: FAIL — `Cannot find module './present'`.

- [ ] **Step 3: Extract `relativeLabel`**

Create `src/lib/time/relative.ts` holding `Locale`, `UNITS` and `relativeLabel` **moved verbatim** from `src/lib/projects/derive.ts:20-41`. Then in `derive.ts` replace those lines with:

```ts
import { relativeLabel, type Locale } from '@/lib/time/relative'
export { relativeLabel, type Locale }
```

- [ ] **Step 4: Add the dictionary keys, BOTH locales**

`src/lib/i18n/dictionaries/en.ts` — inside a new `workspace` section:
```ts
companyNone: 'Untitled',
companyMany: '{n} companies',
citationDrifted: 'The source moved — this quote is no longer at that line',
citationAbsent: 'The source was removed from this workspace',
```
`src/lib/i18n/dictionaries/he.ts` — the same keys:
```ts
companyNone: 'ללא שם',
companyMany: '{n} חברות',
citationDrifted: 'המקור זז — הציטוט כבר לא נמצא בשורה הזו',
citationAbsent: 'המקור הוסר מסביבת העבודה',
```

- [ ] **Step 5: Implement `present.ts`**

```ts
import type { Dictionary } from '@/lib/i18n/dictionaries/en'
import { relativeLabel, type Locale } from '@/lib/time/relative'
import type { CitationState, WorkspaceRow, WorkspaceItemRow, Workspace, WsFile } from './data'

// Row -> display shape. Pure, DOM-free, no I/O, so every label rule is testable
// under node:test. This is the seam where facts become labels; nothing upstream
// of it is allowed to store one.

/** Collapse whitespace so a reflowed line is not mistaken for a moved one. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Is a citation still telling the truth?
 *
 * `resolved` is the text the anchor points at TODAY, or null when the anchor no
 * longer resolves. The comparison exists because formatted_data is regenerated
 * when a transcript is re-processed: the line id survives while its sentence
 * changes, so a citation can resolve to the wrong words. Rendering that as a
 * normal link is exactly the "plausible-looking, not absent" failure.
 */
export function citationState(
  block: { source_item_id: string | null; source_quote: string | null },
  resolved: string | null
): CitationState {
  if (!block.source_item_id) return 'absent'
  if (resolved === null) return 'absent'
  if (!block.source_quote) return 'live'
  return norm(resolved).includes(norm(block.source_quote)) ? 'live' : 'drifted'
}

/** Spread, not [0]: name[0] on an emoji splits a surrogate pair. */
export function workspaceInitial(name: string): string {
  return [...name.trim()][0] ?? '+'
}

/** One company names itself; several are counted; none is not invented. */
export function deriveCompany(companyNames: string[], dict: Dictionary): string {
  const unique = [...new Set(companyNames.filter(Boolean))]
  if (unique.length === 0) return dict.workspace.companyNone
  if (unique.length === 1) return unique[0]
  return dict.workspace.companyMany.replace('{n}', String(unique.length))
}

export function presentWorkspace(
  row: WorkspaceRow,
  items: WorkspaceItemRow[],
  companyNames: string[],
  now: Date,
  locale: Locale,
  dict: Dictionary
): Workspace {
  const company = deriveCompany(companyNames, dict)
  return {
    id: row.id,
    name: row.name,
    company,
    sub: dict.workspace.sub,
    subtitle: `${company} · ${dict.workspace.sub}`,
    fileCount: items.length,
    updatedLabel: relativeLabel(row.updated_at, now, locale),
    initial: workspaceInitial(row.name),
    files: items.map(
      (i): WsFile => ({ id: i.id, name: i.name, kind: i.kind, live: i.is_open })
    ),
    // Agent execution is out of scope this chapter, so a real workspace has
    // none. Empty, never demo content on a real row.
    agents: [],
    actions: [],
    docTitle: row.doc_title,
  }
}
```

- [ ] **Step 6: Register the test, run the battery**

Append ` src/lib/workspace/present.test.ts` to the `test` script in `package.json`.
Run: `npm test` → all pass. `npx tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/time src/lib/projects/derive.ts src/lib/workspace/present.ts src/lib/workspace/present.test.ts src/lib/i18n/dictionaries package.json
git commit -m "feat(workspace): presentation + citation state, and relativeLabel moves out of projects"
```

---

### Task 5: Apply the migration, then the DB module

**Files:**
- Create: `src/lib/db/workspaces.ts`
- Modify: `agent-memory/cross-cutting.md` (append BEFORE applying)

**Interfaces:**
- Consumes: the four tables; row types from `@/lib/workspace/data`.
- Produces: `listWorkspaces(supabase)`, `getWorkspaceFull(supabase, id)`, `createWorkspace(supabase, userId, name)`, `patchWorkspace(supabase, id, patch)`, `addItem(supabase, userId, workspaceId, input)`, `patchItem(supabase, id, patch)`, `deleteItem(supabase, id)`, `listBlocks(supabase, workspaceId)`, `addBlock(supabase, userId, workspaceId, input)`, `patchBlock(supabase, id, patch)`, `deleteBlock(supabase, id)`, `countWorkspaceContents(supabase, id)`.

**PRECONDITION: the founder has ruled on the corpus cascade and the reviewer has passed the file.** If either is outstanding, stop and escalate rather than applying.

- [ ] **Step 1: Append to cross-cutting BEFORE applying**

```bash
node scripts/append-log.mjs cross-cutting
```
(stdin form — **no** text argument; passing one silently drops the piped body). Body: the date, the lane, the migration filename, the four table names, and the sentence that the corpus cascade was ruled on by the founder.

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` with the file's contents, name `20260803_016_workspaces`.

- [ ] **Step 3: Verify the four ownership properties by QUERY, not by reading the file**

```sql
select c.relname,
       c.relrowsecurity as rls,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       (select count(*) from pg_constraint k
         where k.conrelid = c.oid and k.contype = 'f'
           and k.confrelid = 'auth.users'::regclass) as fk_to_auth_users
from pg_class c
where c.relname in ('workspaces','workspace_items','workspace_threads','workspace_doc_blocks')
order by c.relname;
```
Expected: four rows, `rls = true`, `policies = 1`, `fk_to_auth_users = 1` on every one. A count that comes from reading the migration instead of from this query is the failure mode `.claude/rules/app.md` files under "a count in a document comes from a command".

- [ ] **Step 4: Write the DB module**

Header comment first, then the functions. Copy the shape of `src/lib/db/projects.ts` exactly — the `Db` structural type, the user-client-only rule stated in the header, and the note that another user's row comes back as **not there** rather than forbidden.

```ts
import 'server-only'
import type {
  WorkspaceRow, WorkspaceItemRow, WorkspaceThreadRow, WorkspaceBlockRow,
} from '@/lib/workspace/data'
import type { ItemCreate, BlockCreate } from '@/lib/workspace/validate'

// ─────────────────────────────────────────────────────────────────────────────
// The only module that talks to the four workspace tables.
//
// Every function takes the CALLER'S OWN supabase client (anon key + the
// request's cookies), never supabaseAdmin. The service-role key bypasses RLS
// entirely, so a mistake in a filter below would leak another user's workspace;
// through the user's client Postgres refuses. RLS is load-bearing here rather
// than decorative.
//
// Consequence: someone else's workspace does not come back as "forbidden", it
// comes back as NOT THERE. That is correct, and the routes render it as a 404.
// ─────────────────────────────────────────────────────────────────────────────

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

const WS_COLS = 'id, user_id, name, doc_title, created_at, updated_at'
const ITEM_COLS =
  'id, workspace_id, user_id, transcript_id, document_id, storage_path, name, kind, is_open, position, created_at'
const BLOCK_COLS =
  'id, workspace_id, user_id, kind, body, position, source_item_id, source_label, source_page, source_line_id, source_quote, created_at, updated_at'

const touch = async (supabase: Db, workspaceId: string) => {
  // updated_at tracks CONTENT, so every content mutation calls this and no
  // layout mutation does. See migration 016's comment on the column.
  await supabase.from('workspaces')
    .update({ updated_at: new Date().toISOString() }).eq('id', workspaceId)
}
```

Then: `listWorkspaces` (order `updated_at` desc), `getWorkspaceFull` (workspace + items ordered by `position` then `created_at` + blocks ordered by `position`, returning `null` when the workspace row is absent), `createWorkspace`, `patchWorkspace` (sets `updated_at`), `addItem`/`deleteItem` (both call `touch`), `patchItem` (does **NOT** call `touch` — layout only), `addBlock`/`patchBlock`/`deleteBlock` (all call `touch`), and:

```ts
/**
 * How much deleting this workspace would DESTROY.
 *
 * Not a convenience. Lane rule 3: the first delete UI anywhere must show the
 * count of what it is about to destroy BEFORE destroying it. Threads store
 * `messages` as inline jsonb, so the cascade takes the whole history with the
 * row rather than unlinking it — and DELETE is already reachable without any
 * UI, because the `for all` owner policy covers it and the anon key ships in
 * the browser bundle.
 */
export async function countWorkspaceContents(
  supabase: Db, workspaceId: string
): Promise<{ items: number; threads: number; blocks: number }> {
  const one = async (table: string) => {
    const { count, error } = await supabase.from(table)
      .select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  return {
    items: await one('workspace_items'),
    threads: await one('workspace_threads'),
    blocks: await one('workspace_doc_blocks'),
  }
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/lib/db/workspaces.ts supabase/migrations/
git commit -m "feat(db): workspace tables applied, and the module that queries them as the user"
```

---

### Task 6: `/api/workspaces` and `/api/workspaces/[id]` — the warm read

**Files:**
- Create: `src/app/api/workspaces/route.ts`
- Create: `src/app/api/workspaces/[id]/route.ts`

**Interfaces:**
- Consumes: `listWorkspaces`, `createWorkspace`, `getWorkspaceFull`, `patchWorkspace`, `countWorkspaceContents`; `parseWorkspaceCreate`, `parseWorkspacePatch`.
- Produces: `GET /api/workspaces → {workspaces: WorkspaceRow[]}`; `POST → {workspace} 201`; `GET /api/workspaces/[id] → {workspace, items, blocks}`; `PATCH → {workspace}`; `DELETE → {deleted: true, counts}`.

- [ ] **Step 1: Write the collection route**

Copy `src/app/api/projects/route.ts` verbatim as the skeleton — including its header comment about the user client — and swap the module calls. `GET` returns `{ workspaces }` with `headers: { 'Cache-Control': 'no-store' }`.

- [ ] **Step 2: Write the item route with the ONE-GET warm read**

```ts
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    // ONE round trip: the workspace, its items WITH is_open/position, and the
    // document's blocks in order. That is what lets the server's first paint
    // show the room as it was left — no second fetch, and no flash of an empty
    // workbench (the ChatHistory defect filed 2026-08-03 is exactly that flash).
    const full = await getWorkspaceFull(supabase, params.id)
    if (!full) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(full, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

`DELETE` counts first and returns the counts with the result:
```ts
const counts = await countWorkspaceContents(supabase, params.id)
const { error } = await supabase.from('workspaces').delete().eq('id', params.id)
if (error) throw new Error(error.message)
return NextResponse.json({ deleted: true, counts })
```

- [ ] **Step 3: Run the auth-boundary test — it already knows about these files**

Run: `node --import tsx --test src/lib/apiAuthBoundary.test.ts`
Expected: PASS. If it fails naming a workspace handler, the auth result was not bound to a variable or not acted on — fix the handler, never the test.

- [ ] **Step 4: Full battery and commit**

Run: `npm test` → all pass. `npx tsc --noEmit` → exit 0.
```bash
git add src/app/api/workspaces
git commit -m "feat(api): workspaces list, create, and the one-GET warm read"
```

---

### Task 7: `/api/workspaces/[id]/items` — the layout write

**Files:**
- Create: `src/app/api/workspaces/[id]/items/route.ts` (POST)
- Create: `src/app/api/workspaces/[id]/items/[itemId]/route.ts` (PATCH, DELETE)

**Interfaces:**
- Consumes: `addItem`, `patchItem`, `deleteItem`; `parseItemCreate`, `parseItemPatch`.
- Produces: `POST → {item: WorkspaceItemRow} 201`; `PATCH → {item}`; `DELETE → {deleted: true}`.

- [ ] **Step 1: Write both routes in the auth-boundary shape**

Same skeleton as Task 6. `POST` validates with `parseItemCreate` → 400 on failure; `PATCH` with `parseItemPatch`. Add this comment above `PATCH`:

```ts
// Layout only, and deliberately small: opening a source, closing it, or dragging
// one before another is a PATCH of ONE row, debounced by the client — never a
// save of the whole workspace. It also does not touch workspaces.updated_at,
// so "edited 2h ago" keeps meaning edited rather than looked at.
```

- [ ] **Step 2: Verify a cross-owner attach fails in the DATABASE**

With the dev server up on 3003 and signed in as user A, attempt to attach an item to a workspace id belonging to user B (obtain B's id by querying as the service role in the SQL editor — reading an id is not a leak here since you are the operator):

Expected: the insert fails on `workspace_items_workspace_fk`, **not** on an application check. That is the composite key doing its job; a plain `workspace_id` FK would have accepted it because referential-integrity checks bypass RLS.

- [ ] **Step 3: Battery and commit**

Run: `npm test`, `npx tsc --noEmit` → both green.
```bash
git add src/app/api/workspaces
git commit -m "feat(api): shelf items — attach, reorder, open, close"
```

---

### Task 8: `/api/workspaces/[id]/blocks` and `/threads`

**Files:**
- Create: `src/app/api/workspaces/[id]/blocks/route.ts` (POST)
- Create: `src/app/api/workspaces/[id]/blocks/[blockId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/workspaces/[id]/threads/route.ts` (GET, POST)
- Create: `src/app/api/workspaces/[id]/threads/[threadId]/route.ts` (PATCH)

**Interfaces:**
- Consumes: `addBlock`, `patchBlock`, `deleteBlock`, `listBlocks`; `parseBlockCreate`, `parseBlockPatch`.
- Produces: `POST /blocks → {block: WorkspaceBlockRow} 201`; `PATCH /blocks/[blockId] → {block}`; `DELETE → {deleted: true}`; `GET /threads → {threads: WorkspaceThreadRow[]}`; `POST /threads → {thread} 201`; `PATCH /threads/[threadId] → {thread}`.

- [ ] **Step 1: Write the four route files**

Same skeleton and the same auth shape. Threads carry `title` and `messages`; a thread patch accepts `title` and `messages` only.

- [ ] **Step 2: Prove a removed source does not delete writing**

Create a workspace, attach a transcript, add a `quote` block citing it, then `DELETE` the item. Then:
```sql
select id, kind, left(body, 40) as body, source_item_id, source_label, source_quote
from workspace_doc_blocks where workspace_id = '<id>';
```
Expected: **the block still exists**, `source_item_id` is `null`, and `source_label`/`source_quote` still hold their snapshots. If the block vanished, the FK was written as cascade — fix the migration before going further.

- [ ] **Step 3: Battery and commit**

Run: `npm test`, `npx tsc --noEmit` → both green.
```bash
git add src/app/api/workspaces
git commit -m "feat(api): the working document's blocks, and workspace threads"
```

---

### Task 9: The browser's door

**Files:**
- Create: `src/lib/workspace/client.ts`

**Interfaces:**
- Consumes: row types from `./data`.
- Produces: `fetchWorkspaces()`, `fetchWorkspace(id)`, `createWorkspaceReq(name)`, `patchWorkspaceReq(id, patch)`, `addItemReq(workspaceId, input)`, `patchItemReq(workspaceId, itemId, patch)`, `deleteItemReq(workspaceId, itemId)`, `addBlockReq(workspaceId, input)`, `patchBlockReq(workspaceId, blockId, patch)`, `deleteBlockReq(workspaceId, blockId)`.

- [ ] **Step 1: Copy the `call<T>` helper from `src/lib/projects/client.ts` verbatim**

Including its header comment: every call surfaces its failure to the caller — a rejected promise, never a swallowed one. `.catch(() => setItems([]))` is the exact defect this chapter's predecessor was gated on.

- [ ] **Step 2: Write the ten thin wrappers, typed to the row shapes**

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/lib/workspace/client.ts
git commit -m "feat(workspace): the browser's only door to the workspace API"
```

---

### Task 10: Swap the stub

**Files:**
- Modify: `src/lib/workspace/data.ts` (delete `DEMO_WORKSPACES`, `getWorkspaces`, `getWorkspace`, `emptyWorkspace`, `WS_THREADS`; keep the agent/legal constants and their demo markers)
- Modify: `src/lib/workspace/data.test.ts` (it tests the demo seed today)
- Modify: `src/components/workspace/WorkspaceRoute.tsx`, `WorkspacePicker.tsx`, `WorkspaceDocs.tsx`, `WorkspaceShell.tsx`, `WorkspaceDetailColumn.tsx`, `WorkingDocument.tsx`, `WorkspaceIntake.tsx`
- Modify: `src/lib/i18n/dictionaries/en.ts`, `he.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–9.
- Produces: Workspace surfaces reading real rows.

**Read the scope boundary at the top of this plan first.** `agents` and `actions` come back **empty** for a real workspace; the sections that rendered demo agent content must render their empty state, not demo content. `WsFileKind` gains `'transcript'` and `'document'`, so every `switch` on it needs the new arms.

- [ ] **Step 1: Extend `WsFileKind` and fix every consumer**

```ts
export type WsFileKind = 'transcript' | 'document' | 'file' | 'pdf' | 'xlsx' | 'slide'
```
Run `npx tsc --noEmit` and fix each error it names — exhaustive `switch`es on kind will surface here. **Keep the legacy arms**: the agent/legal demo constants still use `'pdf' | 'xlsx' | 'slide'`.

- [ ] **Step 2: Add the empty-state strings, BOTH locales**

`en.ts`: `noItems: 'Nothing on the shelf yet'`, `noAgents: 'No agents have run here'`, `loadFailed: 'Could not load this workspace — {error}'`
`he.ts`: `noItems: 'עדיין אין כלום על המדף'`, `noAgents: 'לא רצו כאן סוכנים'`, `loadFailed: 'לא ניתן לטעון את סביבת העבודה — {error}'`

`loadFailed` mixes Hebrew with a Latin error string: render it through the existing `ErrorLine` component (`src/components/projects/ErrorLine.tsx`), which wraps each run in its own `<bdi>` inside a `block` span. Do **not** put `dir` on the line.

- [ ] **Step 3: Wire the warm read on the server**

`src/app/app/workspace/[id]/page.tsx` (or the route that renders `WorkspaceRoute`) calls `getWorkspaceFull` server-side and passes **plain data** to the client component.

**A Server Component may not pass a FUNCTION to a Client Component, and neither `tsc` nor `next build` will tell you** — it fails at render time. This exact mistake broke every project page on 2026-08-02 (`.claude/rules/app.md`). If a closure is needed, create it on the client side of the boundary.

- [ ] **Step 4: Delete the demo workspaces and fix their test**

`src/lib/workspace/data.test.ts` asserts on `DEMO_WORKSPACES`. Rewrite those cases against the types and the surviving constants; do not delete the file.

- [ ] **Step 5: Watch the dev server return 200 for the real URL**

```bash
npm run dev -- -p 3003
```
Load `/app/workspace` and a workspace page. **Watch the dev-server log show 200 for that exact URL.** A green typecheck is not evidence that a page renders — same rule, same file.

- [ ] **Step 6: Battery and commit**

Stop the dev server, then `npm test`, `npx tsc --noEmit`, `npm run build` (never with a dev server up in this checkout).
```bash
git add src/lib/workspace src/components/workspace src/app/app/workspace src/lib/i18n/dictionaries
git commit -m "feat(workspace): the surfaces read real rows, and the demo seed is gone"
```

---

### Task 11: Verification to the two-user bar, and evidence

**Files:**
- Create: `docs/evidence/feat-workspace-tables/2026-08-03-workspace-persistence.md`
- Create: `docs/evidence/feat-workspace-tables/shots/*.jpg`

**An ownership feature verified with a single account is not verified.** Prove RLS with the anon key too, not only through the app.

- [ ] **Step 1: User A — build the milestone**

Sign in as A. Create a workspace, attach a real transcript (there are 60; 56 carry `sections`), open two sources, write a `quote` block citing a real line id. Record the workspace id and the block id.

- [ ] **Step 2: Cold reopen — a NEW browser session, not F5**

Close the browser. Reopen, sign in as A, load the workspace. Expected: the same sources open, in the same order, and the document as written. **Screenshot.** An F5 does not prove this — a soft navigation can serve a cached client render, which is how the previous round was briefly fooled into believing a 500 page had loaded.

- [ ] **Step 3: User B — absence, not refusal**

Sign in as B. Expected: A's workspace is not in the list, and `GET /api/workspaces/<A's id>` returns **404**. Capture the response body. 403 would mean the code is filtering rather than RLS refusing.

- [ ] **Step 4: The anon key, outside the app**

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/workspaces?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```
Expected: `[]`. Repeat for `workspace_items`, `workspace_threads`, `workspace_doc_blocks`. Paste the actual output into the evidence file. Proving RLS only through the app proves the app's filters, not the policy.

- [ ] **Step 5: Photograph the error paths, BOTH locales**

Force each and capture it:
- **a drifted citation** — edit the transcript's `formatted_data` for one line in a scratch row, or point a block at a line id that resolves to different text
- **an absent citation** — delete the cited item and reload
- **`loadFailed`** — a real server 500, forced by a temporary `if (process.env.ATLAS_FORCE_ERROR) throw` inside the route's own `try`, dev server restarted with the flag. **Revert it and PROVE the revert** (`grep -rn "ATLAS_FORCE_ERROR" src/` → no matches; `git diff --stat -- src/app/api/` → empty). Do not patch `window.fetch` — that is what the previous round was gated on.

Every capture in EN and HE. In HE check that a Hebrew workspace name beside a Latin `L0004` anchor keeps its punctuation on the correct side.

- [ ] **Step 6: Write the evidence file**

Sections: what was verified, how each failure was forced, the pictures and **what they do not show**, the anon-key output pasted verbatim, the battery (`npm test` count pasted from the run, `tsc` exit code, build result), and honest residue.

- [ ] **Step 7: Ship**

```bash
npx tsc --noEmit && npm test && npm run build
git add docs/evidence/feat-workspace-tables
git commit -m "docs(evidence): workspace persists, and it is provably one user's"
git push
```
Then `/ship`, append to `agent-memory/ready-queue.md`, and update the Lane M section of `agent-memory/BOARD.md` plus `state-multiview.md`. **Never push `main`.** Counts on the board come from pasted git/test output, never hand-typed.

---

## Plan Self-Review

**Spec coverage:** §4.1–4.4 → Task 1. §2 verified facts → baked into Task 1's SQL. §5 routes → Tasks 6–8. §5.1 auth shape → Global Constraints + Task 6 Step 3. §5.2 warm read → Task 6 Step 2. §5.3 small layout write → Task 7 Step 1. §6 count-first → Task 5's `countWorkspaceContents` + Task 6's DELETE. §7 threads → Task 8. §8 stub replacement → Task 10. §9 open item → founder ruling, no code depends on it. §10 verification → Task 11. §11 build order → task order.

**Gaps found and closed while reviewing:** `workspace_items` needed its own `unique (id, user_id)` for the blocks FK to reference — added to Task 1. `relativeLabel` living in `projects/` would have been an import a reviewer rejects — Task 4 extracts it. `package.json`'s explicit test list would have silently skipped both new test files — now a step in Tasks 3 and 4.

**Type consistency:** `WsItemKind` ('transcript'|'document'|'file') is used identically in `data.ts`, `validate.ts`, the migration's CHECK, and `present.ts`. `CitationState` is declared once in `data.ts` and consumed in `present.ts`. `Parsed<T>` matches the projects module's shape.
