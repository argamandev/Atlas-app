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
// WHAT THIS SCAN DECIDES ON: whether `user_id` appears in the child's
// REFERENCING column list — never on how many columns that list has. Those are
// not the same question, and the difference is the whole law: `foreign key
// (agent_id, created_at) references public.agents (id, created_at)` is composite
// and protects nothing. Round 6 found this guard deciding on arity and fixed it;
// the story is in `findFkCandidates` below, which is where the fact now lives.
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
//     trailing column list, and with or without the `public.` schema prefix, in
//     BOTH the inline and the table-level `foreign key (...)` branch. The inline
//     branch learned both forms at round 4; the table-level branch still
//     required the `public.` qualifier until round 6, which meant an unqualified
//     table-level FK fell through to the inline regex and was reported as
//     single-column — this paragraph claimed otherwise for two rounds. It does
//     not recognise a schema alias or a search_path-relative reference to a
//     table outside `public`/unqualified — none exists in this repo today.
//   - An INLINE constraint is treated as never keyed through user_id, because a
//     single referencing column cannot carry both the child id and user_id. The
//     one shape this over-reports is a deliberate inline `user_id ... references
//     public.<owner-scoped>(user_id)`, which binds no child id and which no
//     migration in this repo writes; it would have to be allowlisted, not
//     silently accepted, if anyone ever wanted it.
//   - The referencing column list is read TEXTUALLY, and here is exactly what
//     that does: each entry is trimmed, its surrounding double quotes removed,
//     and the result LOWERCASED before comparison. So `user_id`, `USER_ID` and
//     `"USER_ID"` all read as `user_id` and all pass. The lowercasing is right
//     for the UNQUOTED forms — Postgres folds an unquoted identifier to lower
//     case, so `USER_ID` genuinely IS the `user_id` column — and it is a
//     deliberate over-acceptance for the quoted one, where Postgres would treat
//     `"USER_ID"` as a DIFFERENT column that could not satisfy this FK at all.
//     Over-accepting an unwritable shape is harmless; under-accepting `USER_ID`
//     would red-line a correct migration. Comparison is by WHOLE TOKEN, so a
//     differently NAMED owner column is correctly refused: `foreign key
//     (agent_id, owner_user_id)` fails, probed rather than assumed.
//     ⚠ THIS PARAGRAPH WAS FALSE WHEN FIRST WRITTEN (round 6) — it claimed
//     `"USER_ID"` was "not recognised", in the same commit that fixed a false
//     stated-limits paragraph one bullet up. The reviewer probed it and it
//     passed green. This whole header's authority rests on being checkable, so
//     every claim in this bullet was re-probed before being written down.
//   - TWO SHAPES PASS THAT A READER MIGHT EXPECT TO FAIL, both probed, neither a
//     live hole — named here so they are not discovered instead:
//     (1) POSITIONS SWAPPED — `foreign key (user_id, agent_id) references
//         public.agents (id, user_id)` passes, because the scan asks whether
//         `user_id` is IN the list, never where. It is not a hole: Postgres pairs
//         referencing to referenced BY POSITION, so this key means "my user_id
//         must equal some agent's id", and it breaks loudly on the first INSERT
//         rather than validating anything false.
//     (2) NO FK AT ALL — a child carrying a bare `agent_id uuid` with no
//         constraint anywhere passes, because a scan for foreign keys cannot see
//         an absent one. Outside this law's own text (it governs how a child FK
//         is KEYED, not whether one exists), and a different law from the one
//         `rules/db.md` states. Nothing here would catch it.
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

/**
 * Blank `--` comments so the two scans below read SQL, not prose.
 *
 * FIXED 2026-08-16 (round 5): normalises CRLF to LF FIRST. Without this, a
 * CRLF line survives `--.*$` untouched — `.` excludes `\r` and, with no `m`
 * flag, `$` anchors only to the true end of the STRING, not to the position
 * before a trailing `\r`. So on `"-- comment\r"`, `.*` can consume up to but
 * not including the `\r`, and then `$` fails because the `\r` is still there
 * unconsumed — the whole pattern never matches, `.replace()` is a no-op, and
 * the comment survives blanking whole. Measured on this tree at round 5: 69
 * comment lines survived in `20260802_015_projects.sql` (CRLF); 0 survived in
 * `20260816_032_agents.sql` (LF) — this function worked on exactly the one
 * file it was written against. Same normalisation `estimateTokens()` already
 * does in this file, for the same reason.
 *
 * Two REAL consequences this let through before the fix, both reproduced
 * against this tree rather than asserted: injecting `references
 * public.projects(id)` into an EXISTING comment in 015 made the guard report
 * a violation on an untouched, correct migration; and a commented-out
 * `create policy ... on public.companies ... using (auth.uid() = user_id)`
 * put `companies` into `ownerScoped`, red-lining its seven legitimate
 * single-column FKs. No false NEGATIVE is reachable this way — unstripped
 * text can only ADD candidates and ADD owner tables, never suppress a real
 * violation — which is why this was a robustness/honesty defect and not a
 * hole, and why it did not block the migration's own apply. The canary below
 * is what stops it recurring silently.
 */
function stripComments(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
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

type FkCandidate = { table: string; keyedThroughUserId: boolean; snippet: string }

/**
 * Every `references [public.]<table>[(...)]` in the file, inline or table-level,
 * each carrying THE FACT THE LAW DECIDES ON: is `user_id` in the REFERENCING
 * column list?
 *
 * FIXED 2026-08-16 (round 6). This used to report `columnCount` and the test
 * used to pass anything with `columnCount > 1` — FK ARITY, which is a PROXY for
 * the fact, not the fact (rules/app.md M3 clause 2). Proven by probe against a
 * copy of this migration tree: `foreign key (agent_id, created_at) references
 * public.agents (id, created_at)` — two columns, zero ownership binding, a run
 * still free to attach itself to a stranger's agent — PASSED the guard green.
 * Arity is not what makes the key safe; carrying `user_id` into it is. The
 * candidate now reports that directly and the test asks for it directly.
 */
function findFkCandidates(sql: string): FkCandidate[] {
  const candidates: FkCandidate[] = []
  const consumedSpans: Array<[number, number]> = []

  // Table-level: [constraint x] foreign key (a, b) references [public.]table (c, d).
  //
  // The `public.` prefix is OPTIONAL here, and captured rather than assumed —
  // closed 2026-08-16 (round 6) alongside the arity fix, because the two are
  // the same defect twice. The inline branch below had already been taught both
  // forms (round 4) while this branch still demanded the qualifier, so an
  // UNQUALIFIED table-level FK fell through to the inline regex, which reports
  // every match as single-column by construction. Probed: a correct
  // `foreign key (agent_id, user_id) references agents (id, user_id)` was
  // reported as a single-column violation — the guard red-lining a migration
  // that obeys the law, while the STATED LIMITS paragraph claimed both forms
  // were handled. A non-`public` schema (`auth.users`) is excluded here exactly
  // as it is inline; the span is consumed either way so the inline regex cannot
  // re-read the same text with less information.
  const fkRe = /foreign\s+key\s*\(([^)]*)\)\s*references\s+(?:(\w+)\.)?(\w+)\s*\(([^)]*)\)/gi
  for (const m of sql.matchAll(fkRe)) {
    consumedSpans.push([m.index!, m.index! + m[0].length])
    const schema = m[2]
    if (schema && schema.toLowerCase() !== 'public') continue
    const cols = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase())
      .filter(Boolean)
    candidates.push({
      table: m[3],
      keyedThroughUserId: cols.length > 1 && cols.includes('user_id'),
      snippet: m[0],
    })
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
    // A single referencing column cannot be a composite key, so it cannot carry
    // `user_id` INTO the key alongside the child id — whatever that one column
    // happens to be named. Reported as the fact (`false`), not as an arity.
    candidates.push({ table: m[2], keyedThroughUserId: false, snippet: m[0] })
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
      if (c.keyedThroughUserId) continue
      if (!ownerScoped.has(c.table)) continue
      const key = `${file}::${c.table}`
      if (GRANDFATHERED.has(key)) continue
      violations.push(
        `${file}: child FK into owner-scoped "${c.table}" is not keyed through user_id — ${c.snippet.trim()}`
      )
    }
  }

  assert.deepEqual(
    violations,
    [],
    'PostgreSQL referential-integrity checks bypass RLS: a child FK that does not carry user_id ' +
      "into the key validates a row pointed at a STRANGER's parent row — and a second column " +
      'that is not user_id (e.g. `(agent_id, created_at)`) buys nothing at all. Key it ' +
      '(child_col, user_id) references parent(id, user_id) instead — see rules/db.md and ' +
      '20260802_015_projects.sql.\n' +
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

/**
 * CANARY — proves `stripComments` actually blanks a CRLF comment, rather than
 * merely claiming to. Round 5's own bug (see `stripComments`'s header) passed
 * every other test in this file while doing nothing on the one migration that
 * happens to still be CRLF on disk; nothing here would have caught it without
 * a test that checks the STRIPPING ITSELF, on a fixture confirmed to still
 * need it. `api/errorShape.test.ts` earned this exact shape of test after its
 * first version "matched the word `ApiError` inside a comment and failed to
 * bite when the bug was reintroduced to test it" — same lesson, applied here.
 *
 * Verified by reverting the `\r\n` → `\n` normalisation and watching this fail
 * before trusting the fix, the same way the FK-regex gaps above were verified
 * by mutation rather than by reading the diff.
 */
test('stripComments actually blanks a comment on a CRLF migration file (canary)', () => {
  const fixture = '20260802_015_projects.sql'
  const raw = readFileSync(join(MIGRATIONS_DIR, fixture), 'utf8')

  // Guard the guard: if this fixture is ever re-saved as LF, the canary would
  // pass by testing nothing CRLF-specific — fail loudly and name a fixture
  // that is still CRLF instead.
  assert.ok(
    raw.includes('\r\n'),
    `${fixture} is no longer CRLF — this canary needs a fixture with real CRLF line endings to mean anything`
  )

  const stripped = stripComments(raw)
  const survivingCommentMarkers = stripped.split('\n').filter((line) => line.includes('--')).length

  assert.equal(
    survivingCommentMarkers,
    0,
    `${survivingCommentMarkers} '--' comment marker(s) survived blanking a CRLF migration — ` +
      'stripComments is not actually stripping CRLF comments, and every violation/owner-scope ' +
      'check above this line is reading prose as SQL again.'
  )
})
