# Workspace V1 — closing the loop, and the four intake defects found doing it

**Branch** `feat/workspace-tables` · **lane** multiview (port 3003) · **date** 2026-08-07
**Commits this round** `a911799..3aeb2c5` (3 commits: `a911799`, `be32eb3`, `3aeb2c5`)
**Battery** 536 tests / 0 fail · `tsc --noEmit` exit 0 · `next build` green · console clean

Founder, 2026-08-07: close Workspace v1 and merge it, then MAYA across Home/Calendar/chat,
then Railway, then iterate on Workspace.

---

## Part 1 — three holes closed (`be32eb3`)

Each already had a route, a table and a client function that were built, tested, and called by
nothing.

| Hole | Was | Now |
|---|---|---|
| Delete a workspace | `DELETE /api/workspaces/[id]` existed, counted its own blast radius, and had no caller. 12 workspaces on screen, 11 named "New workspace". | Trash control per card → confirmation stating what will be destroyed → delete. |
| Remove a source | The ✕ closed a **tab**; nothing took a file off the shelf. `deleteItemReq` had no caller. | Trash per row → confirmation naming the citations about to lose their anchor. |
| The conversation | `workspace_threads` + `listThreads`/`addThread`/`patchThread`: zero callers. Shelf, panes, document and citations all reopened warm; the questions that produced them did not. | Read on the server with the rest of the room, saved from an effect after every turn. |

### Verified live (not claimed)

- **Delete**: created `VERIFY-DELETE-ME`, seeded one conversation, opened the dialog →
  `"1 saved conversation"` + `"This cannot be undone."` (zero counts correctly omitted, singular
  form correct) → confirmed → card gone, `GET /api/workspaces/<id>` → **404**.
- **Remove**: workspace with one MAYA report + 3 document blocks, 2 of them citing it.
  Dialog: *"It comes off this shelf. The file itself stays in Atlas…"* + *"2 citations in your
  working document lose their source…"*. After confirming: `items: 0`, **all 3 blocks survived**,
  the 2 citations had `source_item_id: null` with `source_label` and `source_quote` intact —
  exactly what the dialog promised (migration 016's `on delete set null`).
- **Conversation**: asked a real question of a real 168-page annual report, reloaded, and the
  exchange came back — question, answer, and the "I could only read part of these" caveat, with
  no replay animation. Chats count went 0 → 1 live, then survived the reload; the Chats section
  lists it by its derived Hebrew title with "2 messages".
- **Clipping images are not stored** (`lib/workspace/thread.ts`): round-tripped a turn carrying a
  `dataUrl` through `PUT /thread` → response contained no `base64`; `snipPages` survived.
  Oversize (401 messages) → **400**, refused, not truncated. Unknown role → 400 naming the index.
  Two PUTs → `threads: 1` (the one-thread-per-workspace rule is route-level, not schema-level).
- **Both locales.** Hebrew delete dialog: `"למחוק את VERIFY-REMOVE?"` / `"מקור אחד על המדף"` /
  `"3 פסקאות במסמך העבודה"` / `"שיחה שמורה אחת"` / `"אי אפשר לבטל את הפעולה."` — every count in
  its correct Hebrew singular.

### Bidi, occurrence 5 — and a mis-diagnosis worth recording

The confirmation heading is a template (`"Delete {name}?"`) whose value is issuer or user text,
so it is **always** a mixed line. It now arrives unsubstituted and the value is wrapped in
`<bdi>`; `data.test.ts` forbids pre-joining.

**The first call was wrong.** A trailing YEAR (`…לשנת 2021`) beside an English verb *looks*
orphaned and is simply correct — measured byte-identical with and without `<bdi>`. Probing all
4 templates × 8 realistic names in the live page found **6 of 32 that genuinely differ**, e.g.
the real workspace `תיגבור קבוצה.`:

```
without <bdi>   Delete הצובק רובגית.?    ← the name's own period, pulled off
with    <bdi>   Delete .הצובק רובגית?       and parked against the "?"
```

`verify-app` law 4 (measure a visual diff before changing code) applies to a diff **you** spot,
not only one the founder reports.

---

## Part 2 — the intake could not add a document (`3aeb2c5`)

Founder reported two defects. Reproducing them found two more. All four live in one area
(`intake/selectSources.ts`, `intake/agreement.ts`, the intake route).

### 1. "adding a document doesn't actually work"

Two Tigbur calls share a title, the model rightly asks which, the analyst answers
**"כן, תביא את שתיהן"**. That is agreement but not a *bare* one — `שתיהן` ("both of them") is a
quantity, and a quantity **narrows** when three files are on the table, so it cannot join the
filler vocabulary. The turn goes to the model, which replied *"אז אני מביא לך את שתי השיחות…"*
("so I'm bringing you both") at `status: clarifying`. **Nothing was pulled**, and the analyst was
told the files were coming.

Its `selected` was right; only its status was wrong. `agreedToStandingSet()` now promotes a
yes-word + an unchanged set to `ready`, in code. A change is safe by construction (the model
returns a different set, the comparison fails); an explicit negative blocks it regardless. The
bare vocabulary was **not** widened — `isBareAgreement('כן, תביא את שתיהן')` is still false and a
test pins that.

### 2. "atlas thinks i already have this document"

**Not about deleting** — reproduced in a workspace that had never held anything.
`FROM MAYA — ALREADY IN ATLAS` was explained to the model as *"select it and say Atlas already
has it"*, which is true of Atlas's **library** and false of the analyst's **shelf**.

### 3. The shelf was never stated as a closed set — the cause under both

The per-line marker only ever said what **is** here; nothing said an unmarked file is **not**.
An empty shelf emitted no rule at all, so there was no statement for the model to contradict.
The shelf is now always stated, empty or not, listed by title and declared COMPLETE.

> **A negative fact has to be asserted to be usable.** Leaving it to be inferred from a missing
> marker is what both founder bugs actually were.

### 4. Found while verifying, and worse than either — `date:` meant two things

A filing Atlas has not fetched carries MAYA's real `publicationDate`. The same filing read back
out of `company_documents` carries `created_at` — the ingest moment. Both printed as `date:`, and
the behaviour list declared **in capitals** that `date:` is when a report was published. So Atlas
offered *"דוח תקופתי ושנתי לשנת 2021 שפורסם ב-07.08.2026"* — a 2021 annual report "published" the
afternoon it was pulled. **All 6 MAYA-ingested documents in the live corpus carry an ingest
timestamp.**

Stopgap: lines are labelled `published:` or `added to Atlas:`, and the rule forbids ever
presenting the latter as a publication date.

> **⇒ MAYA phase, first task:** `company_documents` needs a real publication-date column. The
> value **exists at ingest** (`source.publishedISO` in `ingestFiling`) and is discarded. It is DDL
> on the shared production database, so it goes through the `rules/db.md` gate (file → review →
> apply) — and the calendar half of MAYA cannot be built without it anyway.

### Verified live, through the UI and not only the API

| Check | Result |
|---|---|
| "כן, תביא את שתיהן" (the sentence that used to do nothing) | shelf **1 → 3 items** |
| Delete a document, then ask for it back | Atlas offers *"להביא אותו עכשיו?"*, no possession claim; on "כן" the shelf goes **2 → 3** and the document returns |
| Empty workspace, ask for a filing Atlas already holds | `selected: 1`, `status: clarifying`, no "already here" |
| Any reply naming today's date as a publication date | none |

---

## Known and NOT fixed

- The corpus holds `PyuMxe88e8g` and `PyuMxe88e8g_live` — **the same investor call under two ids
  with the same title**. Asking for "both" puts two indistinguishable rows on a shelf.
  Pre-existing, already documented in `selectSources.ts`; a person cannot tell them apart.
- Transcript dates are `created_at` too, so they are not call dates. The model still uses them to
  tell two identically-titled calls apart, which is a real need this branch does not solve.
- Document **export** (PDF/Word) remains deliberately unavailable and says so — Hebrew needs a
  server-side render (`.claude/rules/app.md`). Agents do not run; there is no activity log. All
  three are stated on screen, and all three are Workspace v2 per the founder's phase order.

## Housekeeping

Every workspace created for this verification (`VERIFY-DELETE-ME`, `VERIFY-REMOVE`, `BUGHUNT`,
`BUGHUNT2`, `BUGHUNT3`) was deleted afterwards; the picker is back to 12 rows, all the founder's.
No migration was applied this round.
