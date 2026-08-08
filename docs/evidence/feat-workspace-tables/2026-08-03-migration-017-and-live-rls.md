# feat/workspace-tables — migration 017, and the live two-user RLS check

**Date:** 2026-08-03 · **Lane:** M · **Branch:** `feat/workspace-tables`
**Answers:** the CHANGES verdict on 016 (items 1–5 and the still-owed item 9).

Everything below was produced by EXECUTING statements against the shared production
database, not by reading SQL. Outcomes are pasted from the query results.

---

## 0. Correction to the record, owed on its own terms

Commit `257fb06`'s message says migration 016 was *"file written, reviewed, announced in
cross-cutting, then applied"*. **The review had not happened when that was written.** The
migration row is timestamped 21:32:30 and the review ran after 21:36.

The founder has since removed the review-before-apply gate for this lane, so nothing is
owed for the *sequence*. The **sentence** was still false when written, and a false claim
in the record is worth correcting whether or not the rule behind it still stands. It is
corrected here and in `agent-memory/cross-cutting.md`.

---

## 1. What 017 closes

All four tables held **0 rows** at apply time, so every constraint validated instantly and
no existing row could be invalidated.

| # | 016 accepted this | 017 constraint |
|---|---|---|
| 1 | `kind='file'` holding a `transcript_id` | `workspace_items_kind_matches_source` (CHECK) |
| 2 | a duplicate `storage_path` on one shelf | `workspace_items_storage_uniq` (partial unique) |
| 3 | a block in workspace A citing an item on workspace B | `workspace_doc_blocks_item_workspace_fk` |

**Why #1 is not cosmetic.** The UI reads `kind` to decide how to resolve a citation anchor —
a page number against a document, a line id against a transcript. A row lying about its own
kind makes a block resolve against the wrong source and render a confident, wrong quote,
which is exactly the *plausible-looking, not absent* failure the citation design exists to
prevent.

**#3 closes FULLY, which corrects the verdict's own framing.** The verdict recorded it as
half-closing because 016's looser key cannot be removed on this shared database. It does not
need to be: a row must satisfy **every** foreign key, so the tighter triple is the binding
rule and the older pair is left redundant rather than load-bearing. Closing it required an
otherwise-unnecessary `unique (id, workspace_id, user_id)` on `workspace_items`, for the same
reason `unique (id, user_id)` was required in 016 — a foreign key must reference a uniquely
constrained column SET.

### Verified rejected after applying

```
1 kind=file holding transcript_id      REJECTED: new row for relation "workspace_items"
                                       violates check constraint "workspace_items_kind_matches_source"
2 duplicate storage_path               REJECTED: duplicate key value violates unique
                                       constraint "workspace_items_storage_uniq"
3 block cites an item on ANOTHER shelf REJECTED: insert or update on table
                                       "workspace_doc_blocks" violates foreign key
                                       constraint "workspace_doc_blocks_item_workspace_fk"
control: citation on its OWN shelf     ACCEPTED (correct)
```

The control is not decoration. A constraint that refuses everything is not a fix, and #3 is
the one where over-tightening would have been easy and invisible.

---

## 2. Item 9 — the two-user RLS check on the LIVE database

Outstanding since the 015 chapter. The reviewer's run proved the policy **shape** against
PGlite, which is not this database; and `[]` from the anon key against **empty** tables is
necessary, not sufficient — an empty answer is also what a broken policy returns.

Run here against the real database with rows present, under real JWT claims
(`set local role` + `request.jwt.claims`, which is what `auth.uid()` reads):

| role | workspaces visible | which | writing a row owned by someone else |
|---|---|---|---|
| user A | **2** | `017 probe A1`, `017 probe A2` | REJECTED — *new row violates row-level security policy* |
| user B | **1** | `017 probe B1` | REJECTED |
| anon | **0** | — | REJECTED |

Both sides of the policy are exercised: `USING` (each user sees only their own, anon sees
nothing) and `WITH CHECK` (nobody can write a row owned by another account). A `USING`-only
policy would have passed the first three columns and failed the fourth.

**Earlier, weaker evidence, restated honestly.** Before this run I reported `[]` from the
anon key over HTTP and called it necessary-but-not-sufficient at the time. With two rows
present, the anon key still returned **0 of 2** and its INSERT was refused outright. That is
the sufficient version.

---

## 3. Also verified live, from the 016 round

- **The composite key refuses a cross-owner attach with RLS BYPASSED** (service role):
  `violates foreign key constraint "workspace_items_workspace_fk"`. That is the guard doing
  a job RLS cannot, since referential-integrity checks deliberately ignore RLS.
- **A citation survives its source being deleted.** After removing the cited item:
  `source_item_id` → null, while `body`, `source_label`, `source_line_id` and `source_quote`
  all stayed, and **`user_id` was not nulled** — which is precisely why the constraint names
  its column. An unqualified composite set-null would have passed the migration and failed
  the first time a user removed a cited source.

**All probe rows removed.** Final counts: `workspaces 0, workspace_items 0,
workspace_doc_blocks 0, workspace_threads 0`.

---

## 4. Code fixes

### `src/lib/workspace/validate.ts` — a header that claimed someone else's guarantees

It asserted that every rule in the file mirrors a database constraint, and that loosening one
"only causes 500s, which is the safe direction". **False for the kind↔provenance rule, which
had no constraint at all.** Loosening that one wrote a corrupt row silently.

The header now names the four rules that have a constraint (with the constraint name and the
migration it came from) and states plainly that every other rule — lengths, trimming, which
fields a patch may touch — exists only there. The useful lesson is the one the review
demonstrated: a blanket claim about guarantees you do not own is the sentence that rots.

### Bidi — 4th occurrence of the `<bdi>` rule, and the first where real data made it bite

`{company} · {sub}` under `dir="auto"`. `dir` resolves the **whole line** from its first
strong character, and `presentWorkspace` now feeds real Hebrew issuer names beside a
Latin-or-Hebrew source count:

- **EN** — a Hebrew company flipped the line to RTL: `4 · ןארידת sources`
- **HE** — a Latin company flipped it to LTR: `Qualitau · 4 תורוקמ`

Fixed with `<bdi>` per run and no `dir` on the line, in a block container so the runs stay
inline rather than blockifying (the `ErrorLine` lesson).

**The verdict flagged `WorkspacePicker.tsx` only. Grepping the SHAPE (`} · {`) found the
identical line in `WorkspaceShell.tsx:221`, the shell's panel header, which it missed.** One
flagged occurrence is not the whole set — the same lesson `.claude/rules/app.md` files about
hand-carried counts. The workspace **name** and **document title** also moved to `<bdi>`:
both are user input and can mix scripts on their own, which would have produced occurrence 5.

Remaining `} · {` lines in `src/components` are in Agents, Calendar and Company — pre-existing,
outside this branch, and **not** fed by this chapter's real data. Filed, not touched.

---

## 5. Battery

| Check | Result |
|---|---|
| `npm test` | **257 pass, 0 fail** (pasted from the run) |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **not run this round** — a dev server is up on :3003 in this checkout, and building would overwrite its chunks (rules/app.md). Owed before merge. |

---

## 6. Honest residue

- **The working document is still not wired.** `workspace_doc_blocks`, its API and
  `citationState()` all exist and are tested; `WorkingDocument.tsx` still reads demo state,
  so no block renders. The milestone is not complete until it does.
- **Everything after `3dc015e` remains unreviewed** — 7 API route files,
  `src/lib/db/workspaces.ts`, `WorkspaceSourcePicker.tsx`, the i18n keys, and now 017 and
  these fixes. It gets its own pass before merge.
- **No browser pass with a signed-in session this round.** What was verified without one:
  `/app/workspace` 307s to login, all workspace API routes return 401 with no cookie, and the
  auth-boundary test was proven to actually watch them (adding an unguarded `HEAD` made it
  fail by name; removing it made it pass).
- **The corpus cascade is a harder one-way door than the ruling disclosed.**
  `workspace_items_one_source` makes a source-less tombstone impossible, so the corpus keys
  can never be softened to set-null without relaxing a CHECK. Founder informed; no action.
