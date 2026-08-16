import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE CHILD FK GUARD — rules/db.md's ownership law, one level deeper.
//
// PostgreSQL referential-integrity checks DELIBERATELY BYPASS RLS. A child row
// keyed `agent_id uuid references agents(id)` validates fine even when the
// caller supplies `agent_id = <a stranger's agent>` — RI never asks whether the
// row that FK points at is one the caller could actually SEE. The fix is a
// COMPOSITE key that carries user_id into the FK itself:
// `foreign key (agent_id, user_id) references agents (id, user_id)`. Postgres
// requires the referenced column SET to EXACTLY MATCH an existing unique
// constraint or primary key — not a subset of a wider one, and not a superset —
// so the parent must carry a `unique (id, user_id)` constraint whose columns
// are precisely those two, no more and no fewer.
//
// RECURRENCE THIS GUARDS. Migration 032's first draft shipped four owner-scoped
// tables (agents, agent_runs, agent_findings, agent_run_files) keyed
// single-column throughout, after docs/SMART-LAYER-SPEC.md:165-166 had already
// told the build to copy migrations 015/016 verbatim. Caught by cold review,
// not by any mechanism — which is the exact ADR-0002 shape (a law stated in
// prose recurs until something automated holds it). This is that something.
//
// WHAT "OWNER-SCOPED" MEANS HERE, and why it is not "has a user_id column" —
// AND NOT "has no owner policy at all" either. `transcripts` genuinely carries
// a user_id column AND a genuine owner policy (`20260801_014_transcripts_
// shared_corpus.sql:25-29`: the pre-existing "users see own transcripts"
// policy is DELIBERATELY LEFT IN PLACE and still governs INSERT/UPDATE/DELETE
// for any non-service-role client). What changed in that migration is SELECT
// alone: a second policy grants `for select to authenticated using (true)`,
// and RLS policies for the same command combine with OR, so reads are shared
// while writes stay owner-restricted. THAT is why a single-column child FK
// into it (`workspace_items.transcript_id`) is correct as written, not a hole
// — a caller can already SEE any transcript row through ordinary SELECT, so
// referencing one by id exposes nothing RLS was hiding. The signal this scan
// needs is therefore SHARED READ, not "no owner policy exists"; it looks for
// an owner-shaped policy specifically on the command that gates visibility
// (`using (auth.uid() = user_id)`, which for `transcripts` governs writes, not
// reads) and, because this repo's migrations never write that owner-shaped
// policy for `transcripts`' own SELECT, the scan correctly leaves it out of
// `ownerScoped` — but the REASON is the shared SELECT policy, not an absent
// owner policy.
//
// HOW OWNER-SCOPED TABLES ARE FOUND, two shapes, both present in this repo:
//   1. Per-table (015, 032): `create policy <name> on public.<table> ... using
//      (auth.uid() = user_id)`, guarded or not. Anchored on the CREATE POLICY
//      keyword specifically — not a bare `on public.<table>` — so a `create
//      index ... on public.X (user_id)` or `alter table public.X` sitting
//      nearby can never be mistaken for a policy statement and misattribute
//      ownership to the wrong table.
//   2. Loop-generated (016): a `create policy` built via `execute format(...)`
//      inside a `foreach t in array array['a','b','c']` loop, where the array
//      literal is the only place the table names appear as plain text.
// Both are matched textually; three shapes are KNOWN GAPS, named here rather
// than left for someone to discover: a policy name written with QUOTES and a
// bare (non-`public.`-qualified) table (`create policy "some name" on
// watchlist ...` — this repo's oldest three owner-scoped tables,
// `watchlist`/`notification_prefs`/`sent_alerts`, are written exactly this way
// and are consequently NEVER in `ownerScoped` today; harmless only because no
// migration currently gives any of them a single-column child); the OWNER
// CHECK reversed, `using (user_id = auth.uid())`; and the OWNER CHECK wrapped
// in a sub-select, `using ((select auth.uid()) = user_id)` — the form
// Supabase's own performance docs recommend, so a future migration that takes
// that advice makes its table invisible to this scan without anyone intending
// a gap. A fully dynamic policy or table name built from string concatenation
// rather than a literal would also be invisible; none exists in this repo
// today.
//
// GRANDFATHERED VIOLATIONS. One pre-existing single-column child FK into an
// owner-scoped table predates this law: `quotes.folder_id -> quote_folders(id)`
// (migration 20260614_010_quote_folders.sql). quote_folders.user_id itself
// carries no FK to auth.users at all (rules/db.md's "bad half" list), so this
// table predates the ownership law entirely, not just this composite-key
// clause of it. Fixing it needs a live-data migration on production `quotes`/
// `quote_folders`, out of scope for the ticket that added this test. Narrowly
// allowlisted below — by (file, referenced table) pair, so a NEW single-column
// FK into quote_folders in a LATER migration still fails.
//
// STATED LIMITS:
//   - This is a text scan over the migration files, not a real Postgres catalog
//     walk. It cannot see a constraint added via any shape other than the two
//     above, and it cannot see anything about tables that live outside this
//     repo's migration history (e.g. `transcripts`, `companies`, predating the
//     migration folder) beyond whatever RLS policy text this repo's migrations
//     happen to state for them.
//   - It does not attempt to resolve `on delete` semantics, only column shape.
//   - The OWNER-POLICY scan only recognises `using (auth.uid() = user_id)`,
//     literally. Three policy shapes this repo has never written would make a
//     table invisible to `ownerScoped` even though it genuinely is
//     owner-scoped: the comparison REVERSED (`using (user_id = auth.uid())`),
//     the caller side wrapped in a sub-select (`using ((select auth.uid()) =
//     user_id)` — notably the exact form Supabase's own performance
//     documentation recommends, so adopting that advice on a future table
//     silently drops it out of this scan's reach), and an owner column named
//     something other than `user_id`. A false NEGATIVE from any of these reads
//     as a quiet, correct-looking migration; there is no mechanism here that
//     would catch it, only this note.
//   - The FK scan recognises `references [public.]<table>` with or without a
//     trailing column list, and with or without the `public.` schema prefix
//     (both forms were themselves once a gap here, closed 2026-08-16 round 4).
//     It does not recognise a schema alias or a search_path-relative reference
//     to a table outside `public`/unqualified — none exists in this repo today.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd())
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

/**
 * (migration file, referenced table) pairs whose single-column child FK
 * predates this law and is not fixed by it. See the header comment above for
 * why each entry exists. Keep this list to ONE reason per entry, and keep it
 * scoped to the exact file — a table name alone would silently forgive a NEW
 * violation on the same table in a later migration.
 */
const GRANDFATHERED: ReadonlySet<string> = new Set(['20260614_010_quote_folders.sql::quote_folders'])

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Table names that carry an owner-only RLS policy (`using (auth.uid() = user_id)`). */
function findOwnerScopedTables(sql: string): Set<string> {
  const owners = new Set<string>()

  // Per-table: `create policy <name> on public.<table> ... using (auth.uid() =
  // user_id)`. Anchored on CREATE POLICY, not a bare `on public.<table>` — a
  // `create index ... on public.X (user_id)` sitting before an unrelated
  // table's owner policy would otherwise fall inside the lookahead window and
  // misattribute that policy's ownership to X, failing the battery on a
  // migration that never claimed to own X. The window is also short (300, not
  // 400+) because a real create-policy statement's body is short by
  // construction — `for all to authenticated\n using (...) with check (...)`.
  for (const m of sql.matchAll(
    /create\s+policy\s+\w+\s+on\s+public\.(\w+)[\s\S]{0,300}?using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/gi
  )) {
    owners.add(m[1])
  }

  // Loop-generated: an `array['a','b',...]` literal feeding an owner policy
  // built with `execute format(...)` somewhere below it in the same block.
  for (const m of sql.matchAll(
    /array\s*\[([^\]]+)\][\s\S]{0,800}?using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/gi
  )) {
    for (const t of m[1].matchAll(/'(\w+)'/g)) owners.add(t[1])
  }

  return owners
}

type FkCandidate = { table: string; columnCount: number; snippet: string }

/** Every `references [public.]<table>[(...)]` in the file, inline or table-level. */
function findFkCandidates(sql: string): FkCandidate[] {
  const candidates: FkCandidate[] = []
  const consumedSpans: Array<[number, number]> = []

  // Table-level: [constraint x] foreign key (a, b) references public.table (c, d)
  const fkRe = /foreign\s+key\s*\(([^)]*)\)\s*references\s+public\.(\w+)\s*\(([^)]*)\)/gi
  for (const m of sql.matchAll(fkRe)) {
    const cols = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    candidates.push({ table: m[2], columnCount: cols.length, snippet: m[0] })
    consumedSpans.push([m.index!, m.index! + m[0].length])
  }

  // Inline column definition: `<col> ... references [public.]table[(col2, ...)]`.
  // Postgres only allows a SINGLE column on the referencing side for an inline
  // constraint, so any match here is single-column by construction, regardless
  // of how many columns the referenced side lists. TWO forms this regex used
  // to miss, both closed 2026-08-16 (round 4), because both are legal SQL and
  // the first is the most idiomatic way to accidentally write the exact bug
  // this test exists to catch:
  //   - no column list at all — `references public.agents` — which is legal
  //     and defaults to the parent's PRIMARY KEY. Every parent table in this
  //     repo has a single-column `id` primary key, so the implicit reference
  //     is single-column too; that assumption is this repo-specific, not a
  //     general SQL fact, and is why it is stated here rather than assumed
  //     silently.
  //   - the `public.` schema prefix omitted — `references agents(id)` —
  //     which resolves through the connection's search_path and, in every
  //     migration this repo has ever written, means the same `public` table.
  // The schema is captured and checked explicitly (never assumed blank means
  // `public`) so a genuinely different-schema reference — `auth.users`,
  // `storage.objects` — is excluded exactly as before.
  const inlineRe = /references\s+(?:(\w+)\.)?(\w+)\b\s*(?:\(([^)]*)\))?/gi
  for (const m of sql.matchAll(inlineRe)) {
    const insideConsumed = consumedSpans.some(([s, e]) => m.index! >= s && m.index! < e)
    if (insideConsumed) continue
    const schema = m[1]
    if (schema && schema.toLowerCase() !== 'public') continue
    candidates.push({ table: m[2], columnCount: 1, snippet: m[0] })
  }

  return candidates
}

test('every child FK into an owner-scoped table is composite, keyed through user_id', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // Guard the guard: a broken walk would make this pass by scanning nothing.
  assert.ok(files.length > 10, `only ${files.length} migration files found — is the walk broken?`)

  const parsed = files.map((f) => ({
    file: f,
    sql: stripComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')),
  }))

  const ownerScoped = new Set<string>()
  for (const { sql } of parsed) {
    for (const t of findOwnerScopedTables(sql)) ownerScoped.add(t)
  }
  // Guard the guard: a broken owner-policy regex would also make this pass by
  // finding no owner-scoped tables to check anything against.
  assert.ok(
    ownerScoped.size >= 5,
    `only found ${ownerScoped.size} owner-scoped tables (${[...ownerScoped].join(', ')}) — is the owner-policy scan broken?`
  )

  const violations: string[] = []
  for (const { file, sql } of parsed) {
    for (const c of findFkCandidates(sql)) {
      if (c.columnCount > 1) continue
      if (!ownerScoped.has(c.table)) continue
      const key = `${file}::${c.table}`
      if (GRANDFATHERED.has(key)) continue
      violations.push(`${file}: single-column FK into owner-scoped "${c.table}" — ${c.snippet.trim()}`)
    }
  }

  assert.deepEqual(
    violations,
    [],
    'PostgreSQL referential-integrity checks bypass RLS: a single-column FK into an owner-scoped ' +
      "table validates a row pointed at a STRANGER's parent row. Key it (child_col, user_id) " +
      'references parent(id, user_id) instead — see rules/db.md and 20260802_015_projects.sql.\n' +
      violations.join('\n')
  )
})

test('the owner-scoped table scan finds every table this repo actually RLS-owns', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const ownerScoped = new Set<string>()
  for (const f of files) {
    for (const t of findOwnerScopedTables(stripComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))) {
      ownerScoped.add(t)
    }
  }

  // A representative from each of the two detection shapes this scan relies
  // on — per-table (agents, migration 032) and loop-generated (workspaces,
  // migration 016) — so a regression in either shape fails loudly here rather
  // than silently shrinking the set the main test checks against.
  for (const table of [
    'agents',
    'agent_runs',
    'agent_findings',
    'agent_run_files',
    'workspaces',
    'projects',
  ]) {
    assert.ok(ownerScoped.has(table), `expected "${table}" to be detected as owner-scoped`)
  }
})
