# Review round — the intake cluster, and the two extra doors behind the blocker

**Branch** `feat/workspace-tables` · **lane** multiview · **date** 2026-08-08
**Commits** `79761c5` (the three gating findings) · `f0165a1` (two non-gating guards)
**Battery** 545 tests / 0 fail · `tsc --noEmit` exit 0 · `next build` green

Verdict on the previous ship was **CHANGES**. Founder's call: the lane fixes the intake cluster
first, then it merges. This sheet records what was fixed and how each was proven.

---

## The blocker had three doors, not one

The review filed one. Proving the fix in the browser found two more, both ending the same way:
**a narrowing the analyst asked for is reverted, and filings they declined are fetched from MAYA
and written into the shared corpus.**

### Door 1 — filed: `resolveSelection` unioned at `ready`

`agreement.ts` had two rules one line apart: `ready` merged the standing proposal with the model's
selection, `clarifying` honoured the selection as given. Same payload, opposite meanings, keyed on
a status the route elsewhere distrusts enough to override.

```
proposal ["A","B","C"] · analyst "כן, רק את הראשון"
model    status:"ready", selected:["A"], removed:[]
→ union → ["A","B","C"]
```

**Fixed:** one rule at both statuses. A set the model returned is honoured as returned; only an
EMPTY one falls back to the proposal. `reconcileSelection` had no caller left and was deleted.

Dropping the union is not free — it was defending the founder's 2026-08-04 report *"he only pulled
1 file while i asked for two"*. It is right anyway: a bare "כן" never reaches this function
(`isBareAgreement` pulls the proposal without a model), so what arrives at `ready` carried extra
words, and extra words are where a narrowing lives. And the two errors are not symmetrical —
pulling too few is one sentence to correct, pulling too many spends downloads and writes rows every
member of the platform reads.

> A regression the rewrite introduced and a test caught: `reconcileSelection` deduped as a side
> effect of merging two lists, and `orderBySelection` does not. One id twice would have been one
> FILE twice. Dedupe is now explicit.

### Door 2 — found live: the model narrowed in prose and not in ids

With door 1 fixed, the same conversation still resolved to three:

| turn | observed |
|---|---|
| "תביא לי שלושה דוחות של תיגבור" | proposal of 3 |
| "כן, רק את הראשון" | reply: *"אז רק לוודא — …רק את הדוח התקופתי והשנתי לשנת 2021?"* — **resolved: 3** |

Twice over: the model first returned `selected: []` (so the empty-selection fallback restored all
three), and when it did return ids it returned **all three anyway**, under prose naming one. Its
words and its ids disagreed, and the ids are the half that moves files.

**Fixed:** a narrowing message forbids the empty-selection fallback, and a narrowing that did not
narrow (result equal to the proposal, proposal > 1) is a failed turn rather than agreement to
everything. `narrowsSelection` is a strict subset of NEGATION — `אבל`/`but` and English `just` are
deliberately excluded, because *"כן, אבל תוסיף גם"* is an ADDITION and *"ok, just go ahead"* is
filler; treating either as a cut would drop the agreed set.

### Door 3 — the root under both: `lastProposal` saw around the clearing

Clearing the set on the narrowing turn changed nothing, because the lookup **skipped assistant
turns that proposed nothing** and found the discarded three two turns back:

```
Atlas: "these three?"          proposed:[A,B,C]
analyst: "כן, רק את הראשון"    → set correctly cleared
Atlas: "so just the 2021 one?" → no `proposed` — nothing stands
analyst: "כן"                  → scanned PAST the empty turn → ready, all THREE
```

**Fixed:** the standing proposal is the most recent assistant turn's, whatever it holds. A turn
that offered nothing offered nothing. `lastProposalRemote` now reads the same turn rather than
scanning independently, so ids and MAYA pointers cannot come from different moments.

### Proven live, after the fix — all four flows, same corpus

| flow | before | after |
|---|---|---|
| "כן, רק את הראשון" → "כן" | **ready, 3 files** | **ready, 1** — the 2021 report |
| plain "כן" to a standing offer of 3 | ready, 3 | **ready, 3** (no regression) |
| "כן, אבל תוסיף גם את השיחה" | 4 | **4** (additions still carry the agreed set) |
| narrowing turn's standing set | 3 | **0** — nothing left to pull by accident |

---

## Finding 2 — `agreedToStandingSet` had neither guard its sibling has

One AGREE word anywhere in an unbounded message passed. The review's own counterexamples:
*"מה בדיוק ההבדל ביניהם?"* (`בדיוק`) and *"the first one looks right"* (`right`) — questions.

The exact-set comparison was supposed to be the backstop and never was one: `selectSources.ts`
instructs the model to return the standing set at BOTH statuses, so for any message ABOUT that set
the comparison matches. **Two guards, one of which was always going to pass.**

**Fixed:** the same 60-char bound and the same CLOSED vocabulary as `isBareAgreement`, one step
wider — every word must be a known agreement, filler or QUANTITY word (`שתיהן`, `both`, …). An
unknown word means it is not a plain yes. A trailing `?` is refused outright.

> A test of mine moved with this. It had asserted that a fresh request whose set happened to match
> *should* promote, "because pulling it is what the sentence asked for anyway" — the same
> leaning-on-a-guard-that-always-passes mistake, in my own words. It now asserts the opposite.

## Finding 3 — the panel asked permission for an attach it had already done

On a promoted turn `spoken` held the CLARIFYING reply, which the prompt requires to be a question,
while `pull()` ran in the same turn: *"shall I pull both?"* rendered directly above the "Adding…"
spinner.

**Fixed:** a promoted turn returns `reply: null`. The panel already owns that case — `reply === null`
+ `ready` renders `intakePullingNow` (*"great, I'm pulling them in…"*), which the founder asked for
on 2026-08-04 and which is localised where wording belongs. Verified: `replyIsNull: true`,
`status: ready`, 2 files; during the pull the panel showed no question, and both calls landed.

---

## Non-gating, done

- **`legacyBoundary.test.ts`** — `ATLAS_ROOTS` stopped at `components/projects` while this branch
  wrote ~5,000 lines across `components/workspace`, `components/agents`, `lib/workspace` and
  `lib/maya`. All four added; guard passes.
- **`panes.ts` / `panes.test.ts`** — the review's answer to my question 3 was *belt-and-braces,
  harmless, but the stated reason was never measured*. Confirmed myself: `multi` starts `[]`,
  `split` starts `false`, `is_open` seeds `openTabs`, and a tab becomes a pane only through the
  already-capped `addPane`, so no stored state reaches the clamp. The clamp stays for the second
  writer of `multi` the spec plans; the comment and the test now say what was measured.

## Non-gating, NOT done — and why

**`lib/maya/ingestFiling.ts`** — `ingestDocument` upserts on `(company_id, quarter, doc_type)`, so a
different MAYA filing mapping to the same key replaces the shared row in place: new title, new
pages, while other users' `workspace_items.name` keeps the old title over the new document.

This is not cheap. The correct key is `maya_report_id`, whose unique index is PARTIAL
(`where maya_report_id is not null`), and PostgREST's `onConflict` cannot express the required
predicate — so it needs either a schema change or a separate lookup-then-write path in a function
the manual upload also uses. That is shared-corpus write semantics and deserves its own review.

> **It belongs with the publication-date column in the MAYA phase.** Both are `company_documents`,
> both are DDL on the shared production database, both go through the `rules/db.md` gate, and doing
> them together means one migration and one review rather than two.

## Housekeeping

`NARROW-TEST` and every earlier verification workspace deleted; the picker is back to 12 rows, all
the founder's. No migration applied. Dev server stopped and `.next` cleared before the build.
