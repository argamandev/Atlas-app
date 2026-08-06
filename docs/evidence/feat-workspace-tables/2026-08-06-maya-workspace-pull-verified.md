# Evidence — pulling a MAYA filing into a workspace, verified end to end (2026-08-06)

Founder: *"enable each user pull any report / presentation of a company in a really easy and
accessible way through the chat -> through pulling from the maya api."*

Run against the founder's own signed-in Chrome, port 3003, real MAYA key, live database. The
test case is the one that failed this morning: **Tigbur's 2024 annual report.**

---

## 1. The run

A NEW empty workspace (the founder's Tigbur workspace was deliberately not touched), asked in
Hebrew:

> **תמשוך לי ממאיה את הדוח השנתי של תיגבור לשנת 2024**

Atlas resolved *תיגבור* → issuer **1460** from the directory, queried MAYA across two calendar
windows, and confirmed in words before doing anything. The selection it produced:

```json
{ "status": "clarifying",
  "selected": [{ "id": "maya:1655039",
                 "title": "דוח תקופתי ושנתי לשנת 2024",
                 "when": "2025-03-30T15:55:59.78", "remote": true }] }
```

**That is the correct file, and getting it right is the whole point of the date design.** The
2024 annual report was published **30 March 2025**. A single-year query returns the report
published in 2024, which is the **2023** one. `yearWindows` therefore always asks for
`toYear + 1`, and the model reads the period out of the Hebrew title rather than the date.

Agreeing then produced, in **5.6 seconds**:

```
POST /api/workspaces/…/items/from-maya  →  201
{ "item": { "name": "דוח תקופתי ושנתי לשנת 2024", "kind": "document" }, "fetched": true }
```

The row it created:

| | |
|---|---|
| title | דוח תקופתי ושנתי לשנת 2024 |
| quarter | **FY 2024** — from the title's year, not the 2025 publication year |
| doc_type / source | `report` / `maya` |
| maya_report_id | 1655039 |
| page_count / pages stored | **171 / 171** |
| storage_path | `…/maya/1655039.pdf` — keyed by filing, so filings sharing a period cannot overwrite each other |
| company | קבוצת תיגבור בע"מ, `tase_issuer_id` 1460 — **matched the existing row, no duplicate company** |
| page 1 text | `תיגבור מאגר כ"א מקצועי זמני בע"מ / דוח תקופתי לשנת 2024` |

The workspace then rendered it: tab **"FY 2024 · Report"**, header
*דוח תקופתי ושנתי לשנת 2024*, page **1 / 171**, the company's real cover page in Hebrew.

## 2. And it can be reasoned over

Asked in the workspace chat what the company does, grounded in that file:

> החברה עוסקת בארבעה תחומי פעילות… *"(1) שירותי כוח אדם וסיעוד; (2) שירותי שמירה ואבטחה;
> (3) שירותי נגישות; (4) נדל"ן מניב להשקעה."* (מתוך "דוח תקופתי ושנתי לשנת 2024")

A verbatim quote from a document that did not exist in Atlas ten minutes earlier, cited by
title — and `partial: ["דוח תקופתי ושנתי לשנת 2024"]` came back with it, so the answer says out
loud that it read only part of 171 pages. **Feed → file → text → grounded answer, closed.**

---

## 3. Four defects found by running it, three of which would have shipped

**The agreement turn would have pulled NOTHING.** `proposal` is filtered against the corpus,
and a `maya:` id is never in the corpus — so a set agreed entirely of MAYA filings became empty,
the deterministic shortcut never fired, and the user's *"כן"* did nothing. Caught by reading the
code rather than the screen, at the exact moment the founder has complained about twice before.
Remote ids now travel as pointers the client echoes back.

**The attach endpoint first trusted the browser with the filing itself** — title, issuer name,
and a URL to fetch. That is server-side request forgery, plus one user naming a company for
every member, since `companies` and `company_documents` are shared corpus. It now accepts only
`mayaReportId` + `issuerId` and asks MAYA for everything else. Nothing a client writes becomes
content in Atlas.

**pdfjs cannot be bundled into a Next route.** The ingest died with
`Object.defineProperty called on non-object`, and `src/lib/documents/extract.ts` says why in its
own header: *"import this module only from scripts (tsx) — never from Next server code."* Fixed
by adding `pdfjs-dist` to `serverComponentsExternalPackages`, which is what that list is for.
**The failure was visible on screen** — "Could not add 1 of them", with the file named — which
is the visible-degradation law working rather than a silent empty shelf.

**The model read the `date:` field as the period.** On one sample it selected the file titled
*לשנת 2023* for a 2024 request; on another it chose correctly but announced the publication date
as 31.3.2024 when the list said 2025-03-30. Same mistake twice, in two directions. The selection
prompt now states that the period lives in the title and the date field is publication, with
this exact pair as the worked example, and that a date must be copied or omitted — never
inferred.

**Also fixed:** the failures list was keyed by `title`, and the corpus holds
*"דוח דירקטוריון Q1 2026"* twice — so React would silently render one fewer failure than
occurred, telling the analyst that fewer files failed than actually did.

## 4. The migration was reviewed before it was applied

`.claude/rules/db.md` requires it, and the review earned its place: it caught two indexes on
`maya_issuers(name_he)` / `(name_en)` that serve no query in the branch — and `name_en` is
hardcoded to `null` by the only writer. `drop index` is hook-blocked, so both would have been
permanent dead objects: **migration 018's mistake, one day later.** They were removed before
apply.

It also found that `ensureCompanyForIssuer` is check-then-insert with no uniqueness on
`companies.tase_issuer_id`, so two concurrent first pulls could create two company rows for one
issuer. A partial unique index was added in the same migration.

The unfiltered pre-flight — every index, policy and constraint on the affected tables, **not
filtered by the names being added** — was run before applying and again after. That filter is
precisely what hid 018's redundancy.

## Gates

`npm test` → **496 pass / 0 fail** (39 new, none touching the network). `npx tsc --noEmit`
clean. `npm run build` NOT run — a dev server owns `.next`.

## Owed / not done

- ~~EN locale and a bidi pass were not completed.~~ **Done, and it passes.** Checked by probing
  computed styles on the live page rather than by looking, since the failure mode is a
  direction that resolves wrongly, not a layout that looks odd. In the **English** locale
  (`html lang=en dir=ltr`) with a Hebrew MAYA title on the shelf, both mixed runs are already
  inside `<bdi>` and resolve independently: `FY 2024 · Report` → `dir: ltr` within an `rtl`
  ancestor, and `דוח תקופתי ושנתי לשנת 2024` → `dir: rtl`. The tab label and the pane header
  were already written this way, so a Hebrew filing title dropped into an English UI needed no
  new work — the rule in `.claude/rules/app.md` had already been applied where it mattered.
- A **"Demo content · Sample data — not real analysis"** banner sits above the workspace, now
  over a genuinely real filing. Pre-existing (`overview-stub`), but it is now actively untrue on
  this surface.
- Only the **first PDF** of a multi-PDF filing is attached; the 2024 annual report has two.
- The directory covers only companies that **announced a reporting date** (230 of them).
- Consumers ② chat, ③ calendar, ④ live calls are not built. The layer is shaped for them and
  `layering.test.ts` keeps it that way.
