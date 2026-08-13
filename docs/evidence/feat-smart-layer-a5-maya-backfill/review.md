# Cold review record — `feat/smart-layer-a5-maya-backfill` (slice A5)

Five reviews: three pre-apply rounds on migration 031 (`atlas-reviewer`, per `rules/db.md`'s
"reviewed BEFORE it is applied"), then a two-axis branch review (Standards + Spec) run in
parallel over `git diff main...HEAD`.

Every finding below is answered. `RECURRENCE: yes → <law>` means the defect class has
happened before and the answer had to be a mechanism, not a promise (ADR-0002).

---

## Rounds 1–3 · migration 031, on the file, before apply

**Round 1 — CHANGES.** Two blockers, both fatal, both caught before the SQL touched
production — which is the entire argument for the pre-apply gate, since a narrowing would
have needed hook-blocked SQL.

FINDING · BLOCKER · `truncated = saw < in_scope` is permanently true for any scope
  larger than the pool — i.e. every production query after this slice's backfill. I had
  dropped the pool from ticket 05's own prescribed form. **Answer:** the rule is
  `saw < least(pool, in_scope_capped)`. The pool belongs in the comparison because the
  CALLER chose it; `ef_search` and `max_scan_tuples` do not, because nobody did.
RECURRENCE: yes → Degradation must be VISIBLE. Third wrong version of this flag; the
  mechanism is now two tests that each kill a previously-shipped rule.
FINDING · BLOCKER · the battery certified that premise — a test asserting 200-of-61,402
  with a 200 pool "was cut off", which is the shape of a perfectly healthy query.
  **Answer:** replaced with the pool-limited-and-complete case it was missing.
RECURRENCE: yes → M2 · Never let a test certify an untrue premise
- WARNING · `run.mjs` still printed "filled its N-row pool" as the truncation reason →
  reason string and header rewritten. RECURRENCE: no.
- WARNING · "counted off an index by the same statement" untrue — they are separate
  statements sharing one snapshot **because the function is `stable`**. Documented, with a
  do-not-relax, since the backfill inserts chunks while users search. RECURRENCE: no.
- WARNING · unmeasured "single-digit milliseconds" for what was a full count → see round 2.
- WARNING · deploy ordering: `retrieve.ts` calls `_v2` before it exists → answered by
  applying 031 ahead of the merge, and by leaving 029 in place. RECURRENCE: no.
- WARNING/NIT · orphaned `atlas_search_chunks` had no home → `docs/open-findings.md`.

**Round 2 — CHANGES.** The rule survived every boundary attack; the rest was over-claiming.

FINDING · BLOCKER · the harness's no-truncation line ("Every channel saw fewer rows
  than its candidate pool") is what it now prints for the very event A5's re-run exists to
  announce. **Answer:** both report branches and the collection comment rewritten to
  cut-short. **RECURRENCE: yes → Degradation must be VISIBLE.**
- WARNING · `limit` bounds rows RETURNED, not rows SCANNED — the "no scan at any corpus
  size, ever" claim was false, and the sparse-predicate case is this slice's own
  mid-backfill state. **RECURRENCE: yes → M1.** Rewritten to say what is actually known.
- WARNING · "~400MB on the read path" was a second unmeasured number replacing the first,
  and misdescribed the mechanism. **RECURRENCE: yes → M1.** Removed.
- **WARNING · hybrid + an emptied tsquery** reported `ran: true` for a channel the SQL had
  switched off — a half-strength search presented as full. **Answer:** 031 returns
  `dense_ran` / `lexical_ran`. **RECURRENCE: yes → Degradation must be VISIBLE.**
- **WARNING · `limit: 0`** returned no rows, and every completeness figure rides on a row —
  so the report stated the scope was empty, out of the caller's own argument. **Answer:**
  refused before the RPC. **RECURRENCE: yes → Degradation must be VISIBLE.**
- WARNING · `COLLISIONS.md` described the round-1 design → corrected by a new entry, since
  the file is append-only by design. RECURRENCE: no.

**Round 3 — CHANGES, with "APPLY: yes after the clamp".**

FINDING · BLOCKER · the zero-row `ran` fallback reinstated the round-2 bug on the one
  path where no row can carry the boolean: an empty scope (a company not yet embedded —
  again this slice's own state) plus an emptied tsquery. **Answer:** the question goes back
  to the database via `atlas_dual_tsquery`, one cheap immutable call, only on the empty path
  and only when lexical was asked for. A failed read throws.
RECURRENCE: yes → Degradation must be VISIBLE
FINDING · BLOCKER · the test asserted that fallback was "the honest reading" →
  replaced with four cases, including the dense-only path that must NOT spend the round trip.
RECURRENCE: yes → M2
- **WARNING · `p_candidates` null/int-max.** `limit null` is NO LIMIT, so both probes became
  the unbounded full counts the migration exists to prevent, and `least(greatest(null,40),1000)`
  would have dropped `ef_search` to 40 silently. **Answer:** clamped once into `v_pool`;
  nothing reads the raw argument. Folded in BEFORE apply. RECURRENCE: no.
- WARNING · `candidates: 0` had the same hole the `limit` guard had just closed, one
  parameter over → same guard. **RECURRENCE: yes → Degradation must be VISIBLE.**
- WARNING · `run.mjs`'s "fuse over the whole corpus" premise does not survive A5 —
  `ef_search` is clamped at 1000, so every unscoped dense case in the next gate reads CUT
  SHORT by construction. Said in the header so it is not misread as a regression. RECURRENCE: no.

Verified by the reviewer and not re-derived after: the retrieval half is byte-for-byte 029
(so this is NOT a retrieval-shape change and does not re-trigger the eval gate); additive;
the new-name rationale holds; grants/`search_path`/invoker match 028/029 and answer the
`probe_idf_tsquery` incident.

**031 applied 2026-08-14** and verified through `retrieveChunks` against the live corpus —
table in `measurements.md` §4.

---

## Branch review · Standards axis

FINDING · BLOCKER · `indexHealthDb.ts` read every row with no `.range()`. PostgREST
  caps a select at 1000; this repo already pages around that in `lib/db/calls.ts`; and A5's
  own backfill takes `company_documents` to ~1,178. The screen built to reveal an
  under-indexed corpus would have begun under-reporting at exactly the size that made it
  necessary — and the browser check that passed it ran against 26 documents.
  **Answer:** it now COUNTS (`head: true` + `count: 'exact'`), exact at any corpus size. The
  only list reads left are the troubled set, bounded by a status filter and a limit, with
  its true total counted separately and rendered, so a cut list is reported as cut.
RECURRENCE: yes → M1 · A green signal proves only what it measured, and →
  Degradation must be VISIBLE.
FINDING · BLOCKER · the 23505 re-read dropped its error, so a failed re-read reported
  `held` with an empty `documentId` — a filing declared present with nothing having looked.
  This is a LIST read, which `supabaseReadDiscipline.test.ts` states is outside its scope.
  **Answer:** an unconfirmed race is now `failed` with a message naming the report id, and a
  test covers both the failed-read and no-row-came-back paths — the only mechanism there is.
RECURRENCE: yes → M3.3 · make the lying state unrepresentable
FINDING · NIT · the ticket said 031 was "NOT applied" while COLLISIONS said it was — a
  hand-carried fact, wrong in the direction that costs the founder a pointless action.
  Ticket corrected.
RECURRENCE: yes → M1 · A green signal proves only what it measured
- JUDGEMENT · `ingestFiling.ts` drops `server-only`. **Kept, deliberately.** Its real
  constraint is the one `documents/ingest.ts` states (pdfjs ⇒ scripts and Next server code);
  `server-only` asserted something stricter and wrong, and made the ONE birth door
  unreachable from the script that must use it. A client bundle fails on pdfjs and a
  service-role key one import further down. This repo has twice recorded `server-only` as
  the reason a defect stayed invisible (`company/logo.ts`, `db/companies.ts`). Written in
  the file.
- SMELL · Duplicated `newestFirst` in `latestOfEach.ts` and `syncFilings.ts` → **fixed**, it
  is exported and imported: two copies of "which filing is newer" that drift are two
  different answers to the question both modules decide on.
- SMELL · the `.env` loader repeated across scripts → **left**. It is the established shape
  (`backfill-corpus.ts`, `retrieval-eval/run.mjs`) and exists because a pre-bash hook blocks
  any command naming a `.env` file; sharing it would need a module those scripts import
  before env exists.
- SMELL · Primitive Obsession on `upsertKeyOf`'s joined string → **left, deliberately.** It
  is one function, documented as mirroring `unique (company_id, quarter, doc_type)`, and a
  test pins that a space separator would hide a collision.

## Branch review · Spec axis

- **Backfill not run; harness re-run not done; freshness not scheduled.** All three
  confirmed, all three stated in the ticket and in `measurements.md`. They are the founder's
  go / a Railway change, not omissions this branch can close. **Blocks "done" — correctly.**
- **Depth shortfall: 207 of 1,385.** Measured, named per filing at run time, three ways out
  written up with a recommendation. Founder's call.
- `docs/MAYA-API.md` stale ("30 most recent", no dialect note) → **fixed**, with the measured
  comparison table.
- SCOPE CREEP · 031 adds four columns where the ticket said "one more count" → **accepted
  and defended**: two are the count pair the ticket's own formula needs, two are `*_ran`,
  which rounds 2 and 3 both required to stop a half-strength search reading as a full one.
- SCOPE CREEP · `limit`/`candidates` guards and the extra empty-path round trip →
  **accepted**, both are round-2/3 blockers.
- `admin/corpus` is reachable by URL only, not linked in the nav. **Accepted for now** and
  recorded here: it is an internal admin screen, `docs/corpus-freshness.md` names the URL,
  and a nav entry needs an admin flag the client sidebar does not currently carry. Worth
  closing when the next admin surface lands.
- `yearSpan()` is year−2…year, so "latest annual" means "latest annual within the 2-year
  catalog window". True, and the honest reading — a company whose most recent annual is
  older than that has not filed one in two years.
