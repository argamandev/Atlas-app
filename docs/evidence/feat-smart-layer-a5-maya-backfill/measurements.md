# Slice A5 — what was measured, and what it costs

Branch `feat/smart-layer-a5-maya-backfill`. Everything here is a run against the live
MAYA API and the live database on 2026-08-14, not an estimate carried from another
document (M1 — a count restated rather than regenerated has been wrong every time here).

---

## 1 · The backfill's real size — full dry run, all 233 companies

`node --import tsx scripts/backfill-maya-corpus.ts --dry-run`

| | |
| --- | --- |
| companies with a `tase_issuer_id` | **233** (of 234 rows; one carries none) |
| companies with no usable catalog | **0** — every issuer answered |
| filings selected by "latest of each" | **1,385** |
| of which quarterly / annual / presentation | 233 / 231 / 921 |
| would be ingested | **1,178** |
| displaced (see §2) | **207** |

Two companies short of 234 annuals and one short of 234 quarterlies: that is the
selector working, not a gap — a recently-listed issuer genuinely has no annual report,
and `selectLatestOfEach` returns what a company HAS rather than substituting.

**Dual-listed issuers come through on event ids alone**, which is the rule ticket 17
measured and this run confirms: אבוג'ן selected a `20F לשנת 2025` as its annual and a
`FORM 6-K- מצגת חברה` as a presentation. An `.xbrl`-presence rule would have dropped
both.

**The price is NOT quoted here.** A dry run cannot know page counts without downloading,
and the ≈$5–8 in the ticket is ticket 17's estimate from a 55–70K-page assumption. At
1,178 documents that assumption implies ~47–60 pages/document, which is plausible and
unverified. Measure it on a real `--limit` run before quoting the founder a number.

---

## 2 · 207 documents cannot be stored — the constraint, measured

**This is the one finding on this branch that needs a founder decision.**

`company_documents` is `unique (company_id, quarter, doc_type)` (migration 012), and that
is still the upsert target — migration 019's header says removing it is hook-blocked and
states the consequence: "for one company, period and document type Atlas holds the most
recently pulled filing".

`quarter` comes from `periodFor`, which assigns a quarter only from an event id and
otherwise falls back to the year. **A deck carrying only `270 מצגת` therefore keys on its
YEAR**, so every period-less deck a company files in one year lands on one row.

| | |
| --- | --- |
| displaced | **207 of 1,385 selected (15%)** |
| all of them presentations | 207 of 921 decks = **22% of decks** |
| companies affected | **91 of 233 (39%)** |
| worst cases | אנלייט אנרגיה 8 · מיטב בית השקעות 8 · אנרג'יקס 7 · ישראל קנדה 7 |
| merely an English edition of the same deck | **12** |
| genuinely distinct Hebrew documents | **195** |

The pattern is legible in the titles: `מצגת משקיעים - רבעון ראשון 2026`,
`מצגת משקיעים - רבעון 3 2025`, `מצגת שוק ההון לרבעון שלישי 2025`. These decks **state
their quarter in Hebrew prose** while carrying no quarter event id, so all four quarters
of a year collapse onto `2026`/`slides`.

**What this branch does about it:** nothing silent. `syncCompanyFilings` resolves the
collision BEFORE any download, keeps the newest, and names every displaced filing in the
run's output. Ingesting both and letting the loser vanish would have meant paying to
download, extract and embed a document that the next upsert overwrites — "success UI for
content the server dropped", one layer down.

**The three ways out, for the founder:**

1. **Accept 1,178.** Nothing to do. The corpus is 15% thinner than the approved depth, and
   the missing documents are named in the run log rather than lost quietly.
2. **Put the publication MONTH in the period for a deck that carries no quarter code**
   (`2026` → `08.2026`). Purely additive, no DB change, recovers nearly all 207 — it
   separates decks on a fact MAYA already gives us. Costs a user-visible label change for
   those decks. **This is the cheap one, and my recommendation.**
3. **Remove the `(company_id, quarter, doc_type)` constraint** so `maya_report_id` — the
   filing's real identity by the ingestion standard §1 — becomes the only key. Correct in
   the long run, but it is hook-blocked SQL plus a change to `ingestDocument`'s conflict
   target, so it is its own small mission, not a rider on this one.

Do NOT read option 1 as free: 195 distinct investor decks is a real hole in a product
whose whole point is that an analyst can find what a company said.

---

## 3 · The live feed speaks a different dialect — a silent-failure trap, closed

Probed both endpoints in one run.

| | `latest-companies-disclosures` (v1.0.0) | `by-issuer` (v2.0.0) |
| --- | --- | --- |
| wrapper | `{ mayaReports: { result: [] } }` | `MayaEnvelope { data: [] }` |
| attachments key | **`attachedfiles`** | **`attachedFiles`** |
| present on | 100% of feed rows | 100% of catalog rows |
| the OTHER spelling present on | **0 rows** | **0 rows** |
| issuer flag | `associated` | `assosiated` (TASE's own) |

Handing feed rows straight to `toRemoteSources` finds no PDF on any of them and drops
every filing — **a poller that runs every ten minutes forever, exits 0, and ingests
nothing**. `normaliseLatestRow` translates at the door; `disclosures.test.ts` pins both
directions, including the negative case.

Also measured: the feed returned **295–298 rows**, not the 30 recorded in
`docs/MAYA-API.md`. Nothing should be sized off that number.

**End-to-end, against the live feed:** 298 disclosures → 76 corpus-eligible → 23 of 53
issuers matched to companies Atlas carries, 30 skipped as not ours (counted, not
discarded). Mid-earnings-season, which is exactly the burst the ticket says can outrun a
fixed-length feed — hence the nightly sweep as the coverage guarantee.

---

## 4 · The truncation blind spot A4 owed — and the two wrong rules on the way

Migration 031. The rule is now `truncated = saw < least(pool, in_scope_capped)`.

Three versions, two of them wrong, both caught before production:

| rule | verdict |
| --- | --- |
| `saw >= ef_search ceiling` | shipped and withdrawn in A4 — reported 5 designs × 19 cases truncated when none was |
| `saw < pool` | what A4 shipped. Silently false the moment HNSW engages — A5's own corpus size |
| `saw < in_scope` | **caught in round-1 review, never applied.** True for every scope bigger than the pool, i.e. every production query after this backfill |
| `saw < least(pool, in_scope)` | current. Round 2 attacked it at every boundary and could not break it |

The counts are capped at `p_candidates + 1` because nothing past the pool changes the
answer, and an uncapped count would put a full count of `document_chunks` on the read path
of every search. **What the cap does and does not buy is written in the migration**: it
bounds rows RETURNED, not rows SCANNED, so it is cheap when the predicate is dense and not
when it is sparse — and sparse is this slice's own mid-backfill state.

031 also returns `dense_ran` / `lexical_ran`, because a query whose tsquery comes out
empty makes the function switch the lexical channel off and the caller was reporting a
half-strength hybrid search as a full one.

**Owed and NOT done: the harness re-run.** `run.mjs --real` against the grown corpus is
what tells us whether HNSW's approximation costs ranking quality. It is meaningless until
the real backfill runs, and it is the gate B1 inherits.

---

## 5 · The admin surface, verified in a browser

`/app/app/admin/corpus`, both locales, every state (`/verify-app`).

- **Content, HE + EN** — real data, and it reproduces A4's record exactly: 5 transcripts
  (3 indexed, 2 excluded), 26/26 documents indexed, 3,181 chunks, 19 filings with parsed
  facts and 7 with none.
- **Error** — driven for real, not simulated: the first load failed because
  `transcripts.title` does not exist (the column is `youtube_title`). The screen said so
  instead of rendering zeroes. A health object zeroed on failure would have shown a broken
  database as a healthy empty corpus.
- **Refusal** — a non-admin gets `adminOnly`, not an empty page.
- **Troubled list** — driven with injected rows (locally, uncommitted), both locales,
  including an unrecognised `index_status` surfacing as "Unrecognised / מצב לא מזוהה".

**The bidi law's second VERIFY step, done properly.** Structure-preserving `<bdi>` → `<span>`
swap (identical node boundaries, so only `unicode-bidi: isolate` differs), then every text
node's x measured in both. On `מצגת משקיעים August 2026 · d-2 · נכשל` in the RTL locale:

| run | with `<bdi>` | without |
| --- | --- | --- |
| `מצגת משקיעים August 2026` | x = 1050 | x = 1020 |
| `d-2` | x = 1020 | **x = 1102** |

**The document id jumps to the far side of the title.** The isolation is load-bearing, and
this is the measurement rather than the assumption — a `<bdi>` that changes nothing looks
identical to one that fixes everything. Two other lines in the same list are unaffected,
which is why measuring one line and generalising would have been the wrong claim.
