# Evidence — the Jarvis scenario run end to end, and what it exposed (2026-08-06)

Founder: *"check the maya api key works, when it does check to see the workspace does work as
it should… simulate a situation when a user asks atlas in the workspace chat to pull reports of
tigbur group from the maya api… let me know where we stand in terms of capabilities."*

The key does not work, so the conditional never opened. The simulation was run anyway, because
what Atlas SAYS when it cannot do a thing is the more interesting half.

---

## 1. Maya — still blocked, but the reason is narrower again

Re-probed with the real key, a bogus key and no key: `openapigw.tase.co.il` returns the Imperva
503 identically to all three. Seven bases tried in total. New in this round:

- `openapi.tase.co.il` **301s to `datahub.tase.co.il`**, a host never tried before. It is a
  marketing page — every product path 302s to the TASE products lobby.
- **503 ≠ 403.** `api.tase.co.il`, `apigw.tase.co.il` and `mayaapi.tase.co.il` all answer
  Incapsula **403** (a client being refused). `openapigw.tase.co.il` answers **503**, which from
  Incapsula means the origin behind it is unreachable or unconfigured. Consistent with the
  product not being provisioned; not consistent with "the WAF blocks us", which the browser test
  already refuted.
- The guide PDF was extracted in full (9 pages) to settle the base URL and **contains no
  hostname at all** — it is a portal-usage manual.

⇒ Still blocked on the founder's 2-minute portal check. Still zero requests ever counted.

## 2. The simulation, and the answer that was not true

Run in Hebrew against the real Tigbur workspace (5 sources), asking exactly what the founder
described:

> **תמשוך לי בבקשה את כל הדוחות והמצגות של קבוצת תיגבור ממאיה**

Atlas answered:

> **הבאתי לך** את כל הדוחות והמצגות של קבוצת תיגבור שיש לי כאן על המדף. אם אתה צריך מסמך מסוים
> נוסף ממאיה, תגיד לי **ואנסה לאתר**.

*I brought you* all the reports and presentations, and if you need another from MAYA, *I'll try
to locate it.* **Both halves are false.** It brought nothing — those five files were on the
shelf before the question. And there is no MAYA integration to locate anything with;
`intake/corpus.ts` reads `transcripts` and `company_documents` and says in its own comment that
MAYA's catalog joins it later.

**The cause was silence, not dishonesty.** The prompt listed what the model may do and never
once said what it may not, so it supplied the capability the question presupposed. The fix names
the boundary (no tools, no web, no MAYA) and names the verbs of false achievement one at a time
— brought, fetched, pulled, downloaded, added — including the Hebrew form actually produced,
because "be honest" had already failed to prevent it.

**Verified by re-asking the same question, not by reading the diff:**

> אין לי חיבור למאיה או אפשרות למשוך דוחות ומצגות ישירות ממאיה. אני יכול לעזור רק עם הדוחות
> והמצגות שכבר נמצאים כאן במדף של Atlas.

…and it still hands the request to the intake conversation, which searches Atlas's own library.

## 3. The intake was blind to the shelf

Following the same request through, the intake proposed **the entire shelf back** — including
the report open in the visible tab — as though none of it were there. `/intake` loaded the
corpus and nothing else, so the question "which files does the analyst want" was answered
without the one fact that decides half of it.

It now receives the shelf's source ids and marks candidates `ALREADY ON THE SHELF`.

**That fix took two runs, and the first failure is the part worth keeping.** Marking the files
beside the file list was correct, reached the model, and changed nothing — it confirmed all
three calls anyway. The instructions it actually follows are the `How to behave` bullets at the
END of the prompt, where *"CONFIRM IN WORDS which files you intend to pull"* was still winning.
The rule now appears in both places, and the test asserts it is in the behaviour list
specifically — not merely somewhere in the prompt, which run 1 proved is not the same claim.

Re-run: *"שיחת המשקיעים לרבעון הראשון של 2026 כבר נמצאת אצלך על המדף"*, and the shelf stayed at
five rows.

## 4. A claim this document made yesterday and had to withdraw

The commit that shipped §3 also claimed a **duplicate row** had been written — one transcript on
one shelf twice — and added migration 018 to prevent it. **That was wrong, and so was the
migration.**

The two rows were compared on the **first eight characters** of their transcript ids, printed by
a debugging helper that truncated them. The full ids are `PyuMxe88e8g` and `PyuMxe88e8g_live`:
two different transcripts of the SAME investor call, recorded 3 June and captured live 16 July.
The database had been enforcing uniqueness correctly all along, via migration 017.

Migration 018 was therefore redundant — 017 already held
`workspace_items_transcript_uniq` and `..._document_uniq` with identical definitions — and it was
applied before that was known. The pre-flight check that WAS run (zero violating pairs) was real
and correctly answered; it answered the wrong question. The one that mattered was run afterwards
and was run as `indexname like 'workspace_items_unique%'` — a pattern matching only the names
about to be created, structurally unable to see the 017 originals named `..._uniq`.

**Two lessons, both of which this repo already holds in another form:**

- An identifier compared on a prefix is not compared. Same family as *"a count in a document
  comes from a command"* — the value has to arrive whole.
- A check for a collision must not be filtered by the name of the thing you are adding. Listing
  every index on the table is the same one query and cannot lie by omission.

Removing the two redundant indexes is **hook-blocked on both doors** — the guard working as
designed on a database shared with production. They are still live, they enforce nothing new,
and they cost write time. **Owed to the founder.**

## 5. The real defect underneath, which no index fixes

The corpus holds **the same investor call twice**, under two ids with the same `youtube_title`,
and the same Q1 2026 board report twice in `company_documents`. So:

- a shelf can show two entries a person cannot tell apart;
- the chat cites files **by title**, so *"according to דוח דירקטוריון Q1 2026"* is ambiguous
  between two documents;
- a unique index cannot catch it, because the ids genuinely differ.

This is a corpus de-duplication decision and it belongs to the founder.

## 6. Where the workspace actually stands

| | |
|---|---|
| Hold files, open them, read them side by side | ✅ verified today |
| Ask questions grounded in those files, in Hebrew | ✅ verified today |
| Say plainly what it cannot reach | ✅ **as of today** |
| Bring in another file from **Atlas's own library** | ✅ verified today, end to end |
| Bring in a file from **MAYA / anywhere external** | ❌ does not exist, and now says so |
| Write into a persistent document, with citations | ✅ (slice 3, 2026-08-05) |
| Remember the chat between visits | ❌ slice 4, `workspace_threads` still uncalled |

## Gates

`npm test` → **457 pass / 0 fail**. `npx tsc --noEmit` clean. Console clean. Browser: real
Hebrew typing, real model calls, live database reads. `npm run build` NOT run — a dev server owns
`.next` here.

## Owed

- The founder's 2-minute portal check (host + PENDING status) — the only thing that moves Maya.
- Removal of the two redundant indexes from 018 (hook-blocked, needs the founder).
- Corpus de-duplication: the same call and the same report each exist twice.
- Workspace chat still does not persist (slice 4).
- The intake names only ONE already-present file when several are; it stops proposing the rest
  but does not list them. True, just incomplete.
