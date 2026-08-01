# Projects Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project a user creates today is still theirs tomorrow, and is provably invisible to any other account.

**Architecture:** Two new owner-scoped tables (`projects`, `project_sources`) with RLS correct at `CREATE TABLE`, plus a `project_id` link on the existing `chat_conversations`. API routes query with the user's **own session client** so RLS is load-bearing rather than decorative. All relative labels are derived at render from timestamps — never stored.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase (`@supabase/ssr`) · Tailwind · `node --import tsx --test`

Spec: `docs/superpowers/specs/2026-08-02-projects-backend-design.md`

## Global Constraints

- **Additive-only SQL.** `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX` / `CREATE POLICY` only. `DROP`/`TRUNCATE`/destructive `ALTER` are hook-blocked on both doors.
- **DDL is reviewed BEFORE it is applied.** Write the migration file, push, get the reviewer's verdict on the file, then apply (Task 8). Never the reverse.
- **APPEND to `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md`** before applying any migration and before changing shared types. Use `node scripts/append-log.mjs cross-cutting "…"` — never Edit that file.
- **Every new user-facing table gets all four:** real FK to `auth.users(id) ON DELETE CASCADE`, RLS enabled, owner policy on **both** `USING` and `WITH CHECK` granted to `authenticated`, and an index on `user_id`.
- **Never store a relative label.** `updatedLabel`, `memWhen`, `capacity`, `meta` are all derived at render.
- **New test files MUST be added to the explicit file list in `package.json`'s `test` script.** It is a list, not a glob — a new test file not added there silently never runs.
- **Both locales, zero key drift.** `en.ts` and `he.ts` must have identical key sets. Hebrew is `dir="rtl"`; only numerals and tickers get `font-mono-num` + `dir="ltr"` — never a Hebrew sentence (iron rule 5).
- **Degradation must be VISIBLE.** Never render success UI for something the server dropped or never did.
- **Lanes never push `main`.** Branch is `feat/workspace-backend`. Finish via `/ship`.
- Battery before every commit that changes code: `npm test` · `npx tsc --noEmit`.

---

### Task 1: Auth — `getSession()` → `getUser()`

The blocker for everything else. `getSession()` reads the user out of the cookie: a shape check plus an `expires_at` the cookie itself supplies. No signature check, no network call. A forged cookie carrying a known user UUID passes, and the routes then query with `supabaseAdmin`, which bypasses RLS. `getUser()` revalidates the token against Supabase, exactly as `src/middleware.ts` already does.

**Four call sites, not the three the board and brief both claim.**

**Files:**
- Modify: `src/lib/auth.ts:19-25` (`getRequestUserId`), `src/lib/auth.ts:35-45` (`getCurrentUser`)
- Modify: `src/app/api/admin/requests/route.ts:8` (local `requireAdmin`)
- Modify: `src/app/api/transcripts/[id]/route.ts:132` (a second, separate local `requireAdmin`)
- Create test: `src/lib/auth/verifyUser.test.ts`
- Create: `src/lib/auth/verifyUser.ts`

**Interfaces:**
- Produces: `resolveUser(supabase): Promise<{ id: string; email: string | null } | null>` — the single verification helper all four sites call.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth/verifyUser.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveUser } from './verifyUser'

// A stub shaped like the supabase client's auth surface. getUser() is the ONLY
// method resolveUser may call — getSession() returns whatever the cookie said,
// so a test that passes when getSession() is consulted is not testing anything.
function clientWith(opts: {
  user?: { id: string; email: string | null } | null
  error?: { message: string } | null
  onSession?: () => void
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => {
        opts.onSession?.()
        return { data: { session: { user: { id: 'cookie-supplied-id' } } }, error: null }
      },
    },
  }
}

test('a verified user is returned', async () => {
  const u = await resolveUser(clientWith({ user: { id: 'real-id', email: 'a@b.c' } }) as never)
  assert.deepEqual(u, { id: 'real-id', email: 'a@b.c' })
})

test('an invalid token yields null even though a cookie session exists', async () => {
  const u = await resolveUser(
    clientWith({ user: null, error: { message: 'invalid JWT' } }) as never
  )
  assert.equal(u, null)
})

test('getSession() is never consulted — the cookie is not evidence', async () => {
  let sessionRead = false
  await resolveUser(clientWith({ user: { id: 'x', email: null }, onSession: () => { sessionRead = true } }) as never)
  assert.equal(sessionRead, false, 'resolveUser must not fall back to the cookie session')
})

test('a thrown network error is contained and yields null, not a crash', async () => {
  const throwing = { auth: { getUser: async () => { throw new Error('network down') } } }
  const u = await resolveUser(throwing as never)
  assert.equal(u, null)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test src/lib/auth/verifyUser.test.ts`
Expected: FAIL — cannot find module `./verifyUser`.

- [ ] **Step 3: Implement**

```ts
// src/lib/auth/verifyUser.ts
type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null }
      error: { message: string } | null
    }>
  }
}

/**
 * Resolve the request's user by REVALIDATING the access token with Supabase.
 *
 * Deliberately does not touch getSession(): in auth-js 2.105.4 that reads the
 * session straight out of the cookie — a shape check plus an expires_at the
 * cookie itself supplies. No signature check, no network call. Since the API
 * routes then query with the service-role client (which bypasses RLS), a forged
 * cookie carrying a known user UUID was enough to read another user's rows.
 */
export async function resolveUser(
  supabase: AuthClient
): Promise<{ id: string; email: string | null } | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return { id: data.user.id, email: data.user.email ?? null }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --import tsx --test src/lib/auth/verifyUser.test.ts` → PASS (4/4)

- [ ] **Step 5: Rewire all four call sites**

In `src/lib/auth.ts`, replace both `getSession()` blocks. `getRequestUserId` keeps its `Authorization: Bearer` branch unchanged (it already uses `supabaseAdmin.auth.getUser(token)`, which verifies):

```ts
import { resolveUser } from '@/lib/auth/verifyUser'

// …inside getRequestUserId, replacing the getSession() block:
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)
  return user?.id ?? null

// …inside getCurrentUser, replacing the getSession() block:
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)
  if (!user) return { userId: null, userName: 'משתמש', isAdmin: false }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, role')
    .eq('id', user.id)
    .single()

  const userName = profile?.first_name || user.email?.split('@')[0] || 'משתמש'
  return { userId: user.id, userName, isAdmin: profile?.role === 'admin' }
```

Then both local `requireAdmin` copies. Each currently does `supabase.auth.getSession()` and reads `session.user.id`; each becomes `resolveUser(supabase)` and reads `user.id`. Read each function in full before editing — they differ in what they return (one returns the session, one returns a `NextResponse | null`), so preserve each one's existing contract and only change how the user is resolved.

- [ ] **Step 6: Verify no `getSession()` remains in an auth decision**

Run: `grep -rn "getSession()" src/`
Expected: no hits in `src/lib/auth.ts`, `src/app/api/admin/requests/route.ts`, or `src/app/api/transcripts/[id]/route.ts`. Any remaining hit must be justified in the commit message or fixed.

- [ ] **Step 7: Battery**

Run: `npm test` then `npx tsc --noEmit`. Both must be green. Add `src/lib/auth/verifyUser.test.ts` to the `test` script list in `package.json` first, or it will not run.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/verifyUser.ts src/lib/auth/verifyUser.test.ts src/lib/auth.ts src/app/api/admin/requests/route.ts "src/app/api/transcripts/[id]/route.ts" package.json
git commit -m "fix(auth): verify the user with getUser(), not the cookie's own claim"
```

---

### Task 2: Pure label derivation

Everything the stub froze into the database as a string is computed here from a timestamp. Pure, DOM-free, no I/O — so it is unit-testable under `node:test`, the same constraint `src/lib/demo/reducer.ts` works to.

Relative times go through `Intl.RelativeTimeFormat`, which handles Hebrew correctly and needs no dictionary keys. Fixed phrases go through the dictionary.

**Files:**
- Create: `src/lib/projects/derive.ts`
- Create test: `src/lib/projects/derive.test.ts`
- Modify: `src/lib/i18n/dictionaries/en.ts`, `src/lib/i18n/dictionaries/he.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PROJECT_CONTEXT_BUDGET`, `relativeLabel(iso, now, locale)`, `memoryLabel(memoryUpdatedAt, now, locale, dict)`, `lineMeta(body, dict)`, `contextChars({instructions, memory, bodies})`, `capacityPercent(used)`, `isOverBudget(used)`.

- [ ] **Step 1: Add the dictionary keys (both locales, identical key sets)**

Add inside the `projects:` block of `src/lib/i18n/dictionaries/en.ts`:

```ts
    memoryNever: 'Never updated',
    memoryUpdated: 'Last updated {when}',
    sourceLines: '{n} lines',
    sourceEmpty: 'Empty — nothing written yet',
    sourceBodyPlaceholder: 'Write the note Atlas should keep in mind…',
    editSource: 'Edit source',
    overBudget: 'Over capacity — trim this project so Atlas is not sent a truncated context.',
```

And the exact-mirror Hebrew in `src/lib/i18n/dictionaries/he.ts`:

```ts
    memoryNever: 'לא עודכן מעולם',
    memoryUpdated: 'עודכן לאחרונה {when}',
    sourceLines: '{n} שורות',
    sourceEmpty: 'ריק — עדיין לא נכתב דבר',
    sourceBodyPlaceholder: 'כתבו את ההערה שאטלס צריך לזכור…',
    editSource: 'עריכת מקור',
    overBudget: 'חריגה מהקיבולת — קצרו את הפרויקט כדי שאטלס לא יקבל הקשר חתוך.',
```

Also fix two strings that become FALSE the moment this ships. In `en.ts`:

```ts
    composerDisabled: 'Chat inside a project is not wired up yet.',
    notFoundHint: 'This project may have been removed, or it belongs to another account.',
```

In `he.ts`:

```ts
    composerDisabled: 'צ׳אט בתוך פרויקט עדיין לא מחובר.',
    notFoundHint: 'ייתכן שהפרויקט הוסר, או שהוא שייך לחשבון אחר.',
```

(`notFoundHint` currently reads "Projects created in this demo live for the session only — a page reload clears them." That is exactly the class of copy this chapter exists to stop being true. If Task 7 lands, `composerDisabled` is removed entirely along with the disabled state.)

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/projects/derive.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROJECT_CONTEXT_BUDGET,
  relativeLabel,
  memoryLabel,
  lineMeta,
  contextChars,
  capacityPercent,
  isOverBudget,
} from './derive'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'

const NOW = new Date('2026-08-02T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

test('relative labels come from the timestamp, never from a stored string', () => {
  assert.match(relativeLabel(ago(2 * HOUR), NOW, 'en'), /2 hours ago/)
  assert.match(relativeLabel(ago(4 * DAY), NOW, 'en'), /4 days ago/)
  // The whole point: the same row renders differently later. A stored
  // "2h ago" would still say "2h ago" a week from now.
  const created = ago(2 * HOUR)
  const later = new Date(NOW.getTime() + 5 * DAY)
  assert.notEqual(relativeLabel(created, NOW, 'en'), relativeLabel(created, later, 'en'))
})

test('relative labels localize to Hebrew rather than emitting English', () => {
  const label = relativeLabel(ago(2 * HOUR), NOW, 'he')
  assert.ok(/[\u0590-\u05FF]/.test(label), `expected Hebrew characters, got "${label}"`)
})

test('memory that was never updated says so, in both locales', () => {
  assert.equal(memoryLabel(null, NOW, 'en', en), en.projects.memoryNever)
  assert.equal(memoryLabel(null, NOW, 'he', he), he.projects.memoryNever)
})

test('memory that WAS updated reports when, not a frozen phrase', () => {
  const label = memoryLabel(ago(2 * DAY), NOW, 'en', en)
  assert.ok(label.includes('2 days ago'), label)
  assert.ok(!label.includes('{when}'), 'the placeholder must be substituted')
})

test('line meta counts the real body', () => {
  assert.equal(lineMeta('a\nb\nc', en), '3 lines')
  assert.equal(lineMeta('', en), en.projects.sourceEmpty)
  assert.equal(lineMeta('   ', en), en.projects.sourceEmpty)
})

test('capacity is measured against a real budget', () => {
  const used = contextChars({ instructions: 'a'.repeat(100), memory: 'b'.repeat(100), bodies: ['c'.repeat(300)] })
  assert.equal(used, 500)
  assert.equal(capacityPercent(0), 0)
  assert.equal(capacityPercent(PROJECT_CONTEXT_BUDGET), 100)
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET), false)
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET + 1), true)
})

test('capacity never exceeds the meter range even when the project does', () => {
  const pct = capacityPercent(PROJECT_CONTEXT_BUDGET * 10)
  assert.ok(pct >= 0 && pct <= 100, `meter out of range: ${pct}`)
  // …but the over-budget FACT must still be reachable, or the UI would
  // show a full bar and say nothing while the context is silently cut.
  assert.equal(isOverBudget(PROJECT_CONTEXT_BUDGET * 10), true)
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --import tsx --test src/lib/projects/derive.test.ts` → FAIL, module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/projects/derive.ts
import type { Dictionary } from '@/lib/i18n/dictionaries/en'

/**
 * The character ceiling actually injected into a chat inside a project.
 * `capacity` in the UI is this ratio — which is the only thing that makes
 * "14% of project capacity used" an honest sentence rather than decoration.
 */
export const PROJECT_CONTEXT_BUDGET = 8_000

type Locale = 'en' | 'he'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
]

/** "2 hours ago" / "לפני שעתיים" — derived, never stored. */
export function relativeLabel(iso: string, now: Date, locale: Locale): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(-Math.round(diff / ms), unit)
  }
  return rtf.format(0, 'minute')
}

export function memoryLabel(
  memoryUpdatedAt: string | null,
  now: Date,
  locale: Locale,
  dict: Dictionary
): string {
  if (!memoryUpdatedAt) return dict.projects.memoryNever
  return dict.projects.memoryUpdated.replace('{when}', relativeLabel(memoryUpdatedAt, now, locale))
}

export function lineMeta(body: string, dict: Dictionary): string {
  if (!body.trim()) return dict.projects.sourceEmpty
  return dict.projects.sourceLines.replace('{n}', String(body.trim().split('\n').length))
}

export function contextChars(input: {
  instructions: string
  memory: string
  bodies: string[]
}): number {
  return (
    input.instructions.length +
    input.memory.length +
    input.bodies.reduce((n, b) => n + b.length, 0)
  )
}

/** Clamped to the meter's range; ask isOverBudget() for the fact it clamps away. */
export function capacityPercent(used: number): number {
  return Math.max(0, Math.min(100, Math.round((used / PROJECT_CONTEXT_BUDGET) * 100)))
}

export function isOverBudget(used: number): boolean {
  return used > PROJECT_CONTEXT_BUDGET
}
```

- [ ] **Step 5: Run tests, add to package.json, run the battery**

Add `src/lib/projects/derive.test.ts` to the `test` script list. Run `npm test` and `npx tsc --noEmit`. Confirm the en/he key counts still match:

```bash
node -e "const{en}=require('tsx/cjs/api').require('./src/lib/i18n/dictionaries/en.ts',__filename);const{he}=require('tsx/cjs/api').require('./src/lib/i18n/dictionaries/he.ts',__filename);const c=o=>Object.entries(o).reduce((n,[,v])=>n+(v&&typeof v==='object'&&!Array.isArray(v)?c(v):1),0);console.log('en',c(en),'he',c(he))"
```
Expected: the two counts are equal.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/derive.ts src/lib/projects/derive.test.ts src/lib/i18n/dictionaries/en.ts src/lib/i18n/dictionaries/he.ts package.json
git commit -m "feat(projects): derive every relative label from timestamps, in both locales"
```

---

### Task 3: The migration file — written, NOT applied

**Files:**
- Create: `supabase/migrations/20260802_015_projects.sql`

- [ ] **Step 1: Confirm the next migration number**

Run: `ls supabase/migrations/ | tail -5`. The last applied is `20260801_014_transcripts_shared_corpus.sql`, so this is `015`. If the listing disagrees, use the real next number.

- [ ] **Step 2: Write the migration**

```sql
-- 20260802_015_projects.sql
-- Projects backend: persistence + ownership. Personal-layer data per docs/DATA-MODEL.md.
-- Additive only. Reviewed BEFORE application per .claude/rules/db.md.
--
-- Ownership law, all four points at CREATE TABLE (retrofitting on this
-- production-shared database means a backfill dance on live data):
--   1. real FK to auth.users(id) ON DELETE CASCADE   2. RLS enabled
--   3. owner policy on USING *and* WITH CHECK, to `authenticated`
--   4. index on user_id

create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  pinned            boolean not null default false,
  instructions      text not null default '',
  memory            text not null default '',
  memory_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Not redundant with the primary key: a foreign key must reference a uniquely
  -- constrained column SET, and project_sources references the pair below.
  constraint projects_id_user_id_key unique (id, user_id)
);

create table if not exists public.project_sources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  body        text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Makes an owner mismatch IMPOSSIBLE in the database rather than checked in
  -- the app: a note's owner can only ever be its project's owner.
  constraint project_sources_project_fk
    foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

alter table public.projects        enable row level security;
alter table public.project_sources enable row level security;

create policy projects_owner on public.projects
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy project_sources_owner on public.project_sources
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists projects_user_id_idx
  on public.projects (user_id);
create index if not exists project_sources_project_id_idx
  on public.project_sources (project_id);
create index if not exists project_sources_user_id_idx
  on public.project_sources (user_id);

-- The link from a chat to its project. Nullable: all pre-existing rows keep
-- working, and Timlul (which shares this table) simply never selects it.
-- A project chat's ownership runs project_id -> projects.id -> user_id ->
-- auth.users.id, cascading the whole way; chat_conversations.user_id has no
-- foreign key and cannot be given one (7 of its 19 rows are already orphaned),
-- so this design does not lean on it.
alter table public.chat_conversations
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists chat_conversations_project_id_idx
  on public.chat_conversations (project_id);
```

- [ ] **Step 3: Do NOT apply it. Commit the file only.**

```bash
git add supabase/migrations/20260802_015_projects.sql
git commit -m "feat(db): migration for the projects tables — file only, awaiting review gate"
```

Application happens in Task 8, after the reviewer has seen the file. This ordering is the whole point: narrowing a policy afterwards needs `DROP`/`ALTER`, both hook-blocked, so a verdict of "narrow that policy" is unactionable if it is already live.

---

### Task 4: The database layer

The only module that talks to the two tables. Queries with the **user's own session client**, so RLS is enforced by Postgres rather than trusted to a `WHERE` clause.

**Files:**
- Create: `src/lib/db/projects.ts`
- Modify: `src/lib/projects/data.ts` (types keep their public shape; the demo seed goes)
- Rewrite test: `src/lib/projects/data.test.ts`

**Interfaces:**
- Consumes: `derive.ts` from Task 2.
- Produces:
  - `listProjects(supabase): Promise<ProjectRow[]>`
  - `getProjectWithSources(supabase, id): Promise<{ project: ProjectRow; sources: ProjectSourceRow[] } | null>`
  - `createProject(supabase, userId, name): Promise<ProjectRow>`
  - `patchProject(supabase, id, patch): Promise<ProjectRow>`
  - `addSource(supabase, userId, projectId, name): Promise<ProjectSourceRow>`
  - `patchSource(supabase, id, patch): Promise<ProjectSourceRow>`

- [ ] **Step 1: Update the public types in `src/lib/projects/data.ts`**

Replace the whole file. The demo seed and `emptyProject` go — the UI now reads real rows. `ContextItem` gains the `id` and `body` the founder's decision 4 requires.

```ts
// ─────────────────────────────────────────────────────────────────────────────
// Projects — the shape the UI renders. Backed by the real tables since
// 2026-08-02 (migration 015); the demo seed that used to live here is gone.
//
// These are DISPLAY shapes: `meta`, `memWhen` and `capacity` are DERIVED at
// render by src/lib/projects/derive.ts and are never columns. Storing them
// would freeze a relative label in the database forever.
// ─────────────────────────────────────────────────────────────────────────────

export type ContextItem = {
  id: string
  name: string
  body: string
  /** derived from `body` — e.g. "6 lines" */
  meta: string
  /** everything is a typed note this chapter; pinned corpus documents get their own table */
  kind: 'TEXT'
}

export type ProjectChat = {
  id: string
  title: string
  /** derived from the conversation's updated_at */
  when: string
}

export type Project = {
  id: string
  name: string
  pinned: boolean
  instructions: string
  memory: string
  /** derived from memory_updated_at — "Never updated" when it is null */
  memWhen: string
  /** derived: characters used vs PROJECT_CONTEXT_BUDGET */
  capacity: number
  /** true when the project exceeds the budget — the UI must SAY so */
  overBudget: boolean
  context: ContextItem[]
  chats: ProjectChat[]
}

export type ProjectRow = {
  id: string
  user_id: string
  name: string
  pinned: boolean
  instructions: string
  memory: string
  memory_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectSourceRow = {
  id: string
  project_id: string
  user_id: string
  name: string
  body: string
  position: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Write `src/lib/db/projects.ts`**

```ts
import 'server-only'
import type { ProjectRow, ProjectSourceRow } from '@/lib/projects/data'

// Every function here takes the caller's OWN supabase client (anon key + the
// request's cookies), never supabaseAdmin. That is deliberate: the service-role
// key bypasses RLS entirely, so a mistake in a filter below would leak another
// user's project. Going through the user's client means Postgres refuses it.
type Db = {
  from: (t: string) => any
}

const PROJECT_COLS =
  'id, user_id, name, pinned, instructions, memory, memory_updated_at, created_at, updated_at'
const SOURCE_COLS = 'id, project_id, user_id, name, body, position, created_at, updated_at'

export async function listProjects(supabase: Db): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLS)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProjectRow[]
}

export async function getProjectWithSources(
  supabase: Db,
  id: string
): Promise<{ project: ProjectRow; sources: ProjectSourceRow[] } | null> {
  const { data: project, error } = await supabase
    .from('projects')
    .select(PROJECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!project) return null

  const { data: sources, error: sErr } = await supabase
    .from('project_sources')
    .select(SOURCE_COLS)
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (sErr) throw new Error(sErr.message)

  return { project: project as ProjectRow, sources: (sources ?? []) as ProjectSourceRow[] }
}

export async function createProject(supabase: Db, userId: string, name: string): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name })
    .select(PROJECT_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectRow
}

export type ProjectPatch = Partial<Pick<ProjectRow, 'name' | 'pinned' | 'instructions' | 'memory'>>

export async function patchProject(supabase: Db, id: string, patch: ProjectPatch): Promise<ProjectRow> {
  const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  // memory_updated_at moves ONLY when memory itself changes, so "Last updated
  // 2 days ago" refers to the memory rather than to any edit of the project.
  if (patch.memory !== undefined) row.memory_updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('projects')
    .update(row)
    .eq('id', id)
    .select(PROJECT_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectRow
}

export async function addSource(
  supabase: Db,
  userId: string,
  projectId: string,
  name: string
): Promise<ProjectSourceRow> {
  const { data, error } = await supabase
    .from('project_sources')
    .insert({ user_id: userId, project_id: projectId, name })
    .select(SOURCE_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectSourceRow
}

export async function patchSource(
  supabase: Db,
  id: string,
  patch: Partial<Pick<ProjectSourceRow, 'name' | 'body'>>
): Promise<ProjectSourceRow> {
  const { data, error } = await supabase
    .from('project_sources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SOURCE_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectSourceRow
}
```

- [ ] **Step 3: Write the row → display mapper with tests**

Create `src/lib/projects/present.ts` — pure, so it is testable without a database:

```ts
import type { Dictionary } from '@/lib/i18n/dictionaries/en'
import type { Project, ProjectRow, ProjectSourceRow, ProjectChat } from './data'
import { memoryLabel, lineMeta, contextChars, capacityPercent, isOverBudget } from './derive'

export function presentProject(
  row: ProjectRow,
  sources: ProjectSourceRow[],
  chats: ProjectChat[],
  now: Date,
  locale: 'en' | 'he',
  dict: Dictionary
): Project {
  const used = contextChars({
    instructions: row.instructions,
    memory: row.memory,
    bodies: sources.map((s) => s.body),
  })
  return {
    id: row.id,
    name: row.name,
    pinned: row.pinned,
    instructions: row.instructions,
    memory: row.memory,
    memWhen: memoryLabel(row.memory_updated_at, now, locale, dict),
    capacity: capacityPercent(used),
    overBudget: isOverBudget(used),
    context: sources.map((s) => ({
      id: s.id,
      name: s.name,
      body: s.body,
      meta: lineMeta(s.body, dict),
      kind: 'TEXT' as const,
    })),
    chats,
  }
}
```

Rewrite `src/lib/projects/data.test.ts` to test `presentProject` instead of the deleted seed:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presentProject } from './present'
import { PROJECT_CONTEXT_BUDGET } from './derive'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'
import type { ProjectRow, ProjectSourceRow } from './data'

const NOW = new Date('2026-08-02T12:00:00Z')

const row = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'p1', user_id: 'u1', name: 'Shipping sector', pinned: true,
  instructions: '', memory: '', memory_updated_at: null,
  created_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-02T10:00:00Z',
  ...over,
})

const source = (over: Partial<ProjectSourceRow> = {}): ProjectSourceRow => ({
  id: 's1', project_id: 'p1', user_id: 'u1', name: 'Bidder brief', body: 'a\nb\nc',
  position: 0, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T12:00:00Z',
  ...over,
})

test('a project that never had memory says so, in both locales', () => {
  assert.equal(presentProject(row(), [], [], NOW, 'en', en).memWhen, en.projects.memoryNever)
  assert.equal(presentProject(row(), [], [], NOW, 'he', he).memWhen, he.projects.memoryNever)
})

test('source meta is counted from the real body, not stored', () => {
  const p = presentProject(row(), [source()], [], NOW, 'en', en)
  assert.equal(p.context[0].meta, '3 lines')
  assert.equal(p.context[0].body, 'a\nb\nc')
  assert.equal(p.context[0].kind, 'TEXT')
})

test('an empty source is labelled empty rather than claiming content', () => {
  const p = presentProject(row(), [source({ body: '' })], [], NOW, 'en', en)
  assert.equal(p.context[0].meta, en.projects.sourceEmpty)
})

test('capacity reflects instructions, memory and every source body', () => {
  const p = presentProject(
    row({ instructions: 'i'.repeat(400), memory: 'm'.repeat(400) }),
    [source({ body: 'b'.repeat(800) })],
    [], NOW, 'en', en
  )
  assert.equal(p.capacity, Math.round((1600 / PROJECT_CONTEXT_BUDGET) * 100))
  assert.equal(p.overBudget, false)
})

test('a project past the budget reports overBudget so the UI can say so', () => {
  const p = presentProject(
    row({ instructions: 'x'.repeat(PROJECT_CONTEXT_BUDGET + 1) }), [], [], NOW, 'en', en
  )
  assert.equal(p.overBudget, true)
  assert.equal(p.capacity, 100)
})
```

- [ ] **Step 4: Battery and commit**

Run `npm test` and `npx tsc --noEmit`. TypeScript will flag every place that still imports `getProjects`/`emptyProject` — those are fixed in Task 6, so expect errors in `src/lib/demo/*` and `src/components/projects/*` until then. If that makes the battery red, do Task 6's edits before committing and combine the two commits.

```bash
git add src/lib/db/projects.ts src/lib/projects/data.ts src/lib/projects/present.ts src/lib/projects/data.test.ts package.json
git commit -m "feat(projects): real read/write layer over the projects tables"
```

---

### Task 5: API routes

**Files:**
- Create: `src/app/api/projects/route.ts` (GET list, POST create)
- Create: `src/app/api/projects/[id]/route.ts` (GET one, PATCH)
- Create: `src/app/api/projects/[id]/sources/route.ts` (POST add)
- Create: `src/app/api/projects/[id]/sources/[sourceId]/route.ts` (PATCH)
- Create test: `src/lib/projects/validate.test.ts`
- Create: `src/lib/projects/validate.ts`

**Interfaces:**
- Consumes: `resolveUser` (Task 1), `db/projects.ts` (Task 4).
- Produces: `parseCreate(body)`, `parsePatch(body)`, `parseSourcePatch(body)` — each returns `{ ok: true, value } | { ok: false, error }`.

- [ ] **Step 1: Write the failing validation test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCreate, parsePatch, parseSourcePatch, NAME_MAX, TEXT_MAX } from './validate'

test('a project needs a non-empty name', () => {
  assert.equal(parseCreate({ name: '' }).ok, false)
  assert.equal(parseCreate({ name: '   ' }).ok, false)
  assert.equal(parseCreate({}).ok, false)
  const ok = parseCreate({ name: '  Shipping sector  ' })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.name, 'Shipping sector')
})

test('oversized input is refused rather than silently truncated', () => {
  assert.equal(parseCreate({ name: 'a'.repeat(NAME_MAX + 1) }).ok, false)
  assert.equal(parsePatch({ instructions: 'a'.repeat(TEXT_MAX + 1) }).ok, false)
})

test('a patch accepts only the four editable fields', () => {
  const p = parsePatch({ name: 'x', pinned: true, instructions: 'i', memory: 'm' })
  assert.equal(p.ok, true)
  // user_id is not editable — a client must never be able to reassign ownership
  const bad = parsePatch({ user_id: 'someone-else' } as never)
  assert.equal(bad.ok, false, 'a patch with no editable field must be refused')
})

test('an empty patch is refused', () => {
  assert.equal(parsePatch({}).ok, false)
})

test('a source patch accepts name and body, and allows an empty body', () => {
  assert.equal(parseSourcePatch({ body: '' }).ok, true)
  assert.equal(parseSourcePatch({ name: 'Bidder brief' }).ok, true)
  assert.equal(parseSourcePatch({}).ok, false)
})
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

```ts
// src/lib/projects/validate.ts
export const NAME_MAX = 200
export const TEXT_MAX = 20_000

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function parseCreate(body: unknown): Parsed<{ name: string }> {
  const name = str((body as { name?: unknown })?.name)?.trim()
  if (!name) return { ok: false, error: 'name is required' }
  if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
  return { ok: true, value: { name } }
}

export type PatchValue = Partial<{ name: string; pinned: boolean; instructions: string; memory: string }>

export function parsePatch(body: unknown): Parsed<PatchValue> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: PatchValue = {}

  if (b.name !== undefined) {
    const name = str(b.name)?.trim()
    if (!name) return { ok: false, error: 'name cannot be empty' }
    if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
    out.name = name
  }
  if (b.pinned !== undefined) {
    if (typeof b.pinned !== 'boolean') return { ok: false, error: 'pinned must be a boolean' }
    out.pinned = b.pinned
  }
  for (const field of ['instructions', 'memory'] as const) {
    if (b[field] !== undefined) {
      const v = str(b[field])
      if (v === null) return { ok: false, error: `${field} must be a string` }
      if (v.length > TEXT_MAX) return { ok: false, error: `${field} exceeds ${TEXT_MAX} characters` }
      out[field] = v
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

export function parseSourcePatch(body: unknown): Parsed<Partial<{ name: string; body: string }>> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Partial<{ name: string; body: string }> = {}
  if (b.name !== undefined) {
    const name = str(b.name)?.trim()
    if (!name) return { ok: false, error: 'name cannot be empty' }
    if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
    out.name = name
  }
  if (b.body !== undefined) {
    const v = str(b.body)
    if (v === null) return { ok: false, error: 'body must be a string' }
    if (v.length > TEXT_MAX) return { ok: false, error: `body exceeds ${TEXT_MAX} characters` }
    out.body = v
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}
```

- [ ] **Step 3: Write the routes**

All four follow one shape. `src/app/api/projects/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { listProjects, createProject } from '@/lib/db/projects'
import { parseCreate } from '@/lib/projects/validate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ projects: await listProjects(supabase) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = parseCreate(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    return NextResponse.json({ project: await createProject(supabase, user.id, parsed.value.name) }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

`[id]/route.ts` uses `getProjectWithSources` for GET (404 when null — which is also what another user's project looks like, because RLS returns no row, and that is the correct answer) and `parsePatch` + `patchProject` for PATCH.

`[id]/sources/route.ts` POST calls `addSource(supabase, user.id, params.id, name)`; the composite key means an attempt to attach a note to someone else's project fails in the database, not merely in a check.

`[id]/sources/[sourceId]/route.ts` PATCH calls `parseSourcePatch` + `patchSource`.

- [ ] **Step 4: Battery and commit**

Add `src/lib/projects/validate.test.ts` to `package.json`. Run `npm test`, `npx tsc --noEmit`, `npm run build`.

```bash
git add src/app/api/projects src/lib/projects/validate.ts src/lib/projects/validate.test.ts package.json
git commit -m "feat(api): project + source routes, RLS-enforced via the user's own client"
```

---

### Task 6: Wire the UI to real data

**Files:**
- Modify: `src/components/projects/ProjectsList.tsx`, `src/components/projects/ProjectView.tsx`
- Modify: `src/lib/demo/DemoStateProvider.tsx`, `src/lib/demo/reducer.ts`, `src/lib/demo/demoState.test.ts`
- Create: `src/lib/projects/client.ts`

- [ ] **Step 1: Write the fetch client**

```ts
// src/lib/projects/client.ts — the browser's only door to the project API.
import type { ProjectRow, ProjectSourceRow } from './data'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchProjects = () => call<{ projects: ProjectRow[] }>('/api/projects')
export const createProjectReq = (name: string) =>
  call<{ project: ProjectRow }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
export const patchProjectReq = (id: string, patch: Record<string, unknown>) =>
  call<{ project: ProjectRow }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const addSourceReq = (projectId: string, name: string) =>
  call<{ source: ProjectSourceRow }>(`/api/projects/${projectId}/sources`, {
    method: 'POST', body: JSON.stringify({ name }),
  })
export const patchSourceReq = (projectId: string, sourceId: string, patch: Record<string, unknown>) =>
  call<{ source: ProjectSourceRow }>(`/api/projects/${projectId}/sources/${sourceId}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  })
```

- [ ] **Step 2: Remove projects from the demo provider**

In `src/lib/demo/reducer.ts` remove the `addProject` and `patchProject` cases, the `projects` field of `DemoState`, and the `emptyProject` import. Workspaces and agents stay — they are still session-only, and this chapter must not make them look otherwise. Update `DemoStateProvider.tsx` to stop exporting `addProject`/`patchProject`, and update `src/lib/demo/demoState.test.ts` to remove the project cases.

- [ ] **Step 3: Point the components at the API**

`ProjectsList.tsx` loads via `fetchProjects()` in an effect and creates via `createProjectReq`. `ProjectView.tsx` loads one project, and its existing `saveInstructions` / `saveMemory` / rename / pin handlers call `patchProjectReq` instead of `patchProject`. `addContext` calls `addSourceReq`.

**Every write must show its outcome.** A failed save currently cannot be distinguished from a successful one. Keep a `saveError` state; on a rejected promise, render the error next to the field. Do not render a success confirmation — nothing in this UI should claim "Saved" unless the response actually came back 200. This is the defect that made `WorkingDocument.tsx`'s "✓ Saved just now" a review BLOCKER; do not repeat it one surface over.

- [ ] **Step 4: Add the source body editor (founder decision 4)**

Each context row gains an edit affordance using the same edit-and-save pattern `instructions` and `memory` already use in this file: a `<textarea>` seeded with `source.body`, a Save that calls `patchSourceReq(projectId, source.id, { body })`, and a Cancel. Placeholder `dict.projects.sourceBodyPlaceholder`, edit label `dict.projects.editSource`. A source with an empty body renders `dict.projects.sourceEmpty` rather than a fabricated line count.

- [ ] **Step 5: Render the over-budget state**

When `project.overBudget` is true, render `dict.projects.overBudget` beside the capacity meter. The meter alone reads as "full", which is not the same as "your context is being cut".

- [ ] **Step 6: Battery and commit**

```bash
git add src/components/projects src/lib/demo src/lib/projects/client.ts
git commit -m "feat(projects): the UI reads and writes real rows, with visible failures"
```

---

### Task 7: Project context injection

Makes instructions, memory and sources actually reach the model. Without it they are stored and ignored — the same silent-degradation class this chapter exists to close.

**Files:**
- Create: `src/lib/chat/projectContext.ts`
- Create test: `src/lib/chat/projectContext.test.ts`
- Modify: the chat route to accept `projectId` and prepend the block

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectContext } from './projectContext'
import { PROJECT_CONTEXT_BUDGET } from '@/lib/projects/derive'

test('the block carries instructions, memory and every source body', () => {
  const r = buildProjectContext({
    name: 'Shipping sector',
    instructions: 'Answer in English.',
    memory: 'Tracking the tender.',
    sources: [{ name: 'Bidder brief', body: 'Three consortia filed.' }],
  })
  assert.ok(r.text.includes('Answer in English.'))
  assert.ok(r.text.includes('Tracking the tender.'))
  assert.ok(r.text.includes('Bidder brief'))
  assert.ok(r.text.includes('Three consortia filed.'))
  assert.equal(r.truncated, false)
})

test('an empty project produces no block at all rather than an empty heading', () => {
  const r = buildProjectContext({ name: 'Empty', instructions: '', memory: '', sources: [] })
  assert.equal(r.text, '')
  assert.equal(r.truncated, false)
})

test('going over budget TRUNCATES and SAYS SO — never silently', () => {
  const r = buildProjectContext({
    name: 'Huge',
    instructions: 'x'.repeat(PROJECT_CONTEXT_BUDGET + 5_000),
    memory: '', sources: [],
  })
  assert.ok(r.text.length <= PROJECT_CONTEXT_BUDGET + 500, 'must be capped')
  assert.equal(r.truncated, true, 'the caller must be able to tell the user')
})
```

- [ ] **Step 2: Implement**

```ts
// src/lib/chat/projectContext.ts
import { PROJECT_CONTEXT_BUDGET } from '@/lib/projects/derive'

export type ProjectContextInput = {
  name: string
  instructions: string
  memory: string
  sources: { name: string; body: string }[]
}

/**
 * Direct injection of the user's OWN written context — not retrieval. Cross-archive
 * search is a separate chapter; nothing here reads the shared corpus.
 *
 * `truncated` exists so the caller can tell the user. A context that is silently
 * cut produces a confident answer built on half the instructions, which is the
 * silent-degradation class in .claude/rules/app.md.
 */
export function buildProjectContext(input: ProjectContextInput): { text: string; truncated: boolean } {
  const parts: string[] = []
  if (input.instructions.trim()) parts.push(`Standing instructions:\n${input.instructions.trim()}`)
  if (input.memory.trim()) parts.push(`What this project knows:\n${input.memory.trim()}`)
  for (const s of input.sources) {
    if (s.body.trim()) parts.push(`Source — ${s.name}:\n${s.body.trim()}`)
  }
  if (parts.length === 0) return { text: '', truncated: false }

  const header = `The user is working inside the project "${input.name}".`
  const full = [header, ...parts].join('\n\n')
  if (full.length <= PROJECT_CONTEXT_BUDGET) return { text: full, truncated: false }
  return { text: full.slice(0, PROJECT_CONTEXT_BUDGET), truncated: true }
}
```

- [ ] **Step 3: Wire it into the chat route**

Read the chat route in full first. Accept an optional `projectId` on the request body; when present, load the project and its sources **with the user's own client** (so a projectId belonging to someone else returns nothing and injects nothing), build the block, and prepend it to the existing context. When `truncated` is true, set a response header `x-project-context-truncated: 1` and surface it in the UI — following the existing `x-chat-fallback` header precedent in this codebase.

- [ ] **Step 4: Battery and commit**

```bash
git add src/lib/chat/projectContext.ts src/lib/chat/projectContext.test.ts src/app/api/chat package.json
git commit -m "feat(chat): a project's own context reaches the model, truncation made visible"
```

---

### Task 8: Apply, verify with TWO users, write the evidence

**GATE: do not start until the migration file has been through the reviewer.**

- [ ] **Step 1: Append to cross-cutting BEFORE applying**

```bash
node scripts/append-log.mjs cross-cutting "[2026-08-02] MIGRATION 20260802_015_projects APPLIED by Lane M — new tables public.projects + public.project_sources (personal layer, docs/DATA-MODEL.md), both with a real FK to auth.users, RLS on, owner policy on USING and WITH CHECK to authenticated, index on user_id. Also adds a NULLABLE project_id column + index to the shared chat_conversations (Timlul unaffected: it never selects the column). Composite key (project_id,user_id) -> projects(id,user_id) makes an owner mismatch impossible. Reviewed as a FILE before application per rules/db.md."
```

- [ ] **Step 2: Apply via the Supabase MCP `apply_migration`**

Not via Bash — the destructive-SQL hook pattern-matches Bash commands, and `apply_migration` is the sanctioned door.

- [ ] **Step 3: Verify the applied shape by querying it, not by assuming**

```sql
select tablename, policyname, cmd, qual, with_check, roles
from pg_policies where tablename in ('projects','project_sources');

select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.projects'::regclass,'public.project_sources'::regclass);
```
Expected: both policies present, `cmd = ALL`, `qual` and `with_check` both `auth.uid() = user_id`, roles `{authenticated}`; the FKs to `auth.users` and the composite key present.

- [ ] **Step 4: Prove RLS at the database — the part the app cannot prove about itself**

With the **anon** key, and again with a second user's JWT claims set, confirm zero rows are visible:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<USER-B-UUID>","role":"authenticated"}';
  select count(*) as visible_to_b from public.projects;  -- expect 0 for A's projects
rollback;
```

Paste the real output into the evidence file. A route filtering correctly while RLS is off looks identical from the browser — this is the step that tells them apart.

- [ ] **Step 5: Two-user verification through the app**

As user A on `:3003`: create a project, add instructions, memory and a note with a body, reload, confirm every field survived. Assert the final URL, not just the pixels — `/app/*` is gated and an unauthenticated capture silently screenshots the login page. As user B: confirm A's project is absent from the list and that A's project URL returns not-found.

**Blocked on the founder:** only 3 accounts exist in `auth.users`, all his. Creating a test account on a database shared with production Timlul is his call. Step 4 needs no account and runs regardless — if step 5 cannot be completed, say so explicitly in the evidence rather than implying two-user coverage.

- [ ] **Step 6: Write the evidence and ship**

Evidence to `docs/evidence/feat-workspace-backend/2026-08-02-projects-m1-verification.md`, stating literally what each artifact does and does **not** show. Then `/ship`: battery, push, append the HANDOFF to the ready queue. Never push `main`.

---

## Self-Review

**Spec coverage.** §4 schema → Task 3. §4 RLS → Tasks 3, 8. §5 derived labels → Task 2. §6 modules → Tasks 4–6, incl. the session-client decision. §7 injection + budget → Tasks 2, 7. §8 auth fix, 4 sites → Task 1. §9 tests + two-user bar → every task, then Task 8. §10 the orphan rows → recorded, not acted on. §11 gaps → carried, not silently closed. §12 process → Task 3 (file only) and Task 8 (gate, cross-cutting append).

**Placeholders.** None. Every code step carries real code; the one place the plan says "read it first" (the chat route, Task 7 step 3) is deliberate — that file's current shape must be read before editing rather than guessed at, and the interface it must produce is fully specified.

**Type consistency.** `ProjectRow`/`ProjectSourceRow` are defined once in Task 4 and used unchanged in Tasks 4–7. `resolveUser` is defined in Task 1 and consumed in Task 5. `PROJECT_CONTEXT_BUDGET` is defined in Task 2 and consumed in Tasks 4 and 7. `presentProject` is defined and tested in Task 4. `ContextItem` gains `id` and `body` in Task 4, which is what Task 6 step 4's editor writes to.

**One deliberate ordering note:** Task 4 deletes `getProjects`/`emptyProject`, which Task 6 still imports at that moment. The plan says so in Task 4 step 4 and allows combining those two commits rather than leaving a red battery — a broken intermediate commit is worse than a slightly larger one.
