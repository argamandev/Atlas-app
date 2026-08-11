# State — multiview
<!-- Private working memory. Owner-only writes. Write before walking away; read at start. -->

## NEXT UP — [2026-08-09] the calendar's WEEK VIEW, once the two branches below are merged

Founder decision, filed in cross-cutting: **day-column layout, same 7-column grid as the month
view — NOT a vertical agenda.** I offered the agenda because full-width rows are where a
wordmark logo becomes readable without hovering; he chose consistency, so that users are not
taught a second layout for the same data. **Month/Week changes DENSITY, not shape.** The week
view's row can be ~40–48px against the month's 27px, which is the real fix for the faint
wordmarks. The toggle's choice must survive a reload.

Two branches wait on a supervisor merge, in this order:
`feat/maya-calendar` @ `b161909` → `feat/company-profiles` @ `544e6d7`.

**Do not start the week view until they land** — a third stacked branch is rebase risk on work
already verified.

---

## SHIPPED — [2026-08-09] CHAPTER 3 MERGE 2 — `feat/company-profiles` @ `544e6d7`

Real company identity: sector, sub-sector, description, website and logo, from ONE
`company-details` request. No migration — all five columns already existed and were already read.
Fill rates: sector/sub_sector/description **4 → 234/234**, website 3 → 211, logo_url 3 → 220.
597 tests · tsc 0. Evidence `docs/evidence/feat-company-profiles/`.

**The lesson of this branch is that I twice reported a LIMIT that was an unmeasured assumption,
and the founder refuted both from what he could see.** First: "MAYA publishes no sector or logo"
— refuted by opening the portal, which lists 41 products. Then: "the calendar pill cannot afford
a logo" — refuted by measuring the pill, which had 3px spare at my first attempt and 17px of room
in total. **Measure the box before declaring it too small.** Both failures share one shape: I
treated the result of my own probe as a property of the world.

---

## Superseded — [2026-08-09] CHAPTER 3 MERGE 1 — `feat/maya-calendar` @ `b161909`

The MAYA report schedule is Atlas's calendar, and the invented company facts are gone.
8 commits (`55ffdf0..43936cc`), 27 files, +1786/-424. Battery **576/576 · tsc 0 · build green**.
Spec `docs/superpowers/specs/2026-08-09-maya-calendar-design.md` ·
evidence `docs/evidence/feat-maya-calendar/2026-08-09-maya-calendar-verification.md` ·
queue entry [2026-08-09].

**Migration 021 IS APPLIED.** DB went 5 → 234 companies, 4 → 895 `scheduled_calls`
(891 MAYA + the 4 mock), 184 upcoming. Sync run twice in full: identical counts, 0 duplicates.

### The lesson of this chapter, and it is about my own confidence

**I turned off a working feature and wrote a comment congratulating myself for it.** I replaced
`isLiveCompany = company.ticker === '1097229'` with `calls.find(c => c.status === 'live')` and
commented that the banner now "follows a real live row, not a hardcoded ticker". Nothing in the
repo writes that status — `git grep` finds only readers — so the condition can never be true and
every company page silently stopped polling the live engine.

The tell I ignored: **I never asked what would make the new condition TRUE.** Deleting a fake is
verifiable by looking. Replacing a mechanism is only verifiable by finding its writer, and I did
not look for one. Next time a fix swaps a trigger, `git grep` the writer before the reader.

Related, same root: **the founder's rule is "no untrue thing on screen", not "no ugly code".** The
ticker was never displayed — it decided which page polls. The fabricated `liveQuarter: 'Q2 2026'`
beside it WAS displayed. I deleted the right one and then also broke the wrong one.

### Three more worth keeping

- **A count in a document comes from a command — and this time the bad count was in MY evidence.**
  I wrote "553 tests before this branch"; measuring the base commit in a throwaway worktree said
  **556** (553 was a mid-branch number taken after I deleted a test file). The headline total was
  real; the decomposition under it was memory. Fourth filing of this class repo-wide, first in my
  own evidence file.
- **Eyes-on only covers the states you actually render.** My first pass opened one company page —
  קומפיוגן, which has no future events — so the "next scheduled" card never drew, and it hid TWO
  defects: a `dir="ltr"` shredding the Hebrew date, and a report due today filtered out all day by
  an instant comparison against a midnight bucket. Pick the row that exercises the branch, not the
  first row.
- **A dry run must predict the real run.** Mine reported 875 issuers "not in the directory" when
  they were in it and merely had no company row yet, because a dry run inserts nothing. A
  diagnostic that names the wrong cause is worse than none — it sends the next person to re-run
  the wrong script. Fixed, and the same class bit again later (the third link case).

### ⚠ WHAT THE NEXT SESSION SHOULD KNOW

- **`/api/live/state` should report WHICH company it is broadcasting.** Until it does, the live
  banner is gated on `LIVE_DEMO_TICKER` (`src/lib/live/demoCompany.ts`) — one named constant that
  replaced three hardcoded literals. That is the live chapter's job.
- **Unknown-time rows bucket at midnight Jerusalem and are NOT viewer-safe outside Israel.** A
  surface must compare them by DAY (`CompanyOverview.isFuture` is the pattern). Any new consumer
  that compares by instant will show report dates a day early for London/New York viewers.
- **`scheduled_calls.source` defaults to `'mock'` and every read path excludes `'mock'`.** Any new
  writer that omits `source` produces a row invisible everywhere, with no error. Changing the
  column default needs its own migration.
- **Tier 2 was deliberately not synced.** `maya-refresh-issuers.ts --sweep` walks ids 1–2600
  (~9 min) and finds the ~500 companies that file but never hold a call. It belongs to the
  company-pages merge, which will have somewhere to render them. The sweep's upper bound is
  MEASURED, not guaranteed — density was 80% at id 2500 and 0% at 3000.
- ~~**Logos are a separate session and the founder knows.** MAYA has no logo or website field…~~
  **RETRACTED 2026-08-09 — this was my claim and it was wrong.** Logos are at
  `mayafiles.tase.co.il/logos/he-IL/{issuerId:6}.jpg`: public, no key, no subscription, and
  **220 of our 233 companies have a real one** (13 placeholder, 0 missing). Sector/website/
  address/phone/email are on `GET /v1/maya-reports-online/company-details` — in **v1.0.0 of the
  same product we already pay for**; we are registered against 2.0.0. See `docs/MAYA-API.md`.
  **The lesson, which is this repo's oldest one arriving one level lower than before:** I probed
  guessed paths, got an F5 WAF page, and read the failure as *absence* — then wrote "MAYA
  publishes no logo" into four documents. The portal catalogue lists **41 products**; I had never
  opened it. `MAYA-API.md` already said "a base URL is configuration, read from the system that
  issues it, never deduced". A **path list is configuration too**. The founder overturned it in
  one sentence — "I can see the sector and the logo on the MAYA website" — because he was
  reasoning from what exists and I was reasoning from what my probe returned.
  **Corollary worth more than the endpoint: a 403 is only evidence if you know who sent it.**
  Kong's `{"message":"You cannot consume this service"}` means *not subscribed*; the WAF's HTML
  "Request Rejected" means *the gateway never saw you*. I treated the second as the first.
- ⚠️ **A review subagent probed the destructive-SQL hook with obfuscated payloads** (spelling
  "drop" via char codes) while testing whether the migration would pass. Nothing it learned that
  way was used. Flagged to the founder in-session and recorded in the evidence.

### Still owed after this merge, in the founder's order

1. **Company pages** on the real filings catalog — this is where `maya_filings`,
   `company_documents.published_at` and the `ingestFiling` upsert key belong (both deferred here
   ON PURPOSE: a table designed before its consumer is usually designed wrong).
2. **Chat answering off the DB.** The economics decision is already made and filed: a question like
   "when is company X's next call" must become a SQL lookup, not a catalog stuffed into a prompt.
3. Webinars on the calendar (founder chose option A; their dates live in Hebrew title prose, which
   is the first place a calendar date would come from us interpreting a sentence — its own slice).
4. The workspace intake's standing-proposal durability (ARCHITECTURE.md §8.6) — untouched here.

---

## Superseded — [2026-08-08] chapter 2, Workspace V1 + the MAYA platform layer

Merged to main at `713c114` after three review rounds. Everything below the supervisor marker in
the previous version of this file was that chapter's record and has been archived by supersession;
the lessons that outlived it are already law in `.claude/rules/app.md` (the open-vocabulary
classifier ⇒ buy VISIBLE FAILURE) and `/ship` step 2b.

Two lessons from that chapter that still govern how I work:

- **When a fix keeps opening a new door, the fix strategy is wrong, not just the code.** Rounds 1
  and 2 tried to decide more precisely what the user meant; round 3 made being wrong ASK A
  QUESTION and the cycle stopped. Prefer an invariant at the single choke point every result
  passes through over a smarter guess in the branch where the bug was found. **This chapter used
  it deliberately once** — `kindLabel()` became one shared function the moment a second surface
  was found naming an event wrongly, rather than a third string fixed in place.
- **A filed finding is a lower bound, not a boundary.** Run it against every caller of the property
  it names, not just the line it cites.

## Verified facts that outlive chapters

- MAYA: base `datawise.tase.co.il`, header `apikey`, `Accept-Language: he-IL` MANDATORY (the
  English feed returns `title: null`). Rate limit 10 req/2s, ONE budget for the whole product.
- The Data Hub catalogue holds **41 products**; Atlas is registered for **one version of one**
  (`Market Announcements feed - MAYA 2.0.0`). Before concluding "the API does not have X",
  open the catalogue at `datahubapi.tase.co.il` — it is SSO and the founder's session is live
  in Chrome, so a lane can read it with the browser tools. Do not infer absence from a 403.
- Company logos: `mayafiles.tase.co.il/logos/he-IL/{issuerId:6}.jpg`, public, no key. Sniff
  magic bytes — the content-type lies (a PNG is served as `image/jpeg`) — and hash-compare
  against BOTH placeholders (2,325-byte JPEG `000000`, 2,037-byte PNG) before showing one.
- The schedule feed holds **2025 and 2026 only** — 2020–24 and 2027 return zero rows.
- Conference calls carry a time (452/453); report publications carry one in **0 of 472**.
- 70 of 925 schedule rows are US-time. Reading one as Israeli moves the call seven hours and
  nothing on screen looks wrong.
- The schedule feed ships **no row id**, so `(company_id, year, periodTypeId, reportTypeId)` is the
  only idempotency key available; 34 of 925 rows collide on it (rescheduled calls, both dates kept
  by the feed with no revision field).
- `companies.tase_issuer_id` is NOT `tase_security_id` (Tigbur: issuer 1460, security 1105022).
- The attachment URL is derivable from the report id: `mayafiles.tase.co.il/rhtm/{lo}-{hi}/H{id}.htm`,
  windows-1255 encoded, no key needed. Only ~36% of call announcements contain a join link — the
  rest are telephone bridges, which is a product fact, not an extraction failure.
- `npm test` is an explicit file list in `package.json`; new test files must be registered or
  `testRegistry.test.ts` fails the battery.
- The destructive-SQL hook matches ANYWHERE in a bash command, including commit-message prose.
  Write the message to a file and use `git commit -F <file>`.
- `scripts/append-log.mjs` stdin form takes NO text argument — `... ready-queue - < file` appends a
  literal `-` and discards the redirect. (Bit me again 2026-08-09; the log is append-only, so the
  stray dash is labelled in the entry after it.)

---

## [graduated → PROGRESS.md · docs/evidence/ · rules/app.md · CLAUDE.md — supervisor 2026-08-10]

**Supervisor marker, appended under the parallel-work exception. The lane's own words above are
untouched.** This file was last written 2026-08-09 12:56, so it has NO record of the chapter that
shipped after it. Recorded here so the chapter does not evaporate when this seat clears.

**⚠ `NEXT UP` at the top of this file is STALE twice over.** Both branches it waits on have merged
(`feat/maya-calendar` `b161909`, `feat/company-profiles` `544e6d7`), and the week view is no longer
this seat's job: the founder re-missioned Lane M to the smart layer on 2026-08-10 — *"i will do
everything in lane m"*, across chat · agents · workspace chat. **Read the Lane M section of
BOARD.md before anything else in this file.**

**The missing chapter — `feat/documents-catalog`, merged 2026-08-09/10** (main `47bf674`,
merge-time fixes `227edd5`, doc truth `de76f61`). Durable record: the "2026-08-09 — The documents
catalog" entry in `PROGRESS.md`, evidence in `docs/evidence/feat-documents-catalog/`. It closed the
product loop — years → periods → report · presentation · transcript, opening into the live-call
viewer — with **no new table or column**, and it DELETED the invented-slide stubs rather than
gating them.

**Its lessons have graduated into law, so do not re-derive them here:**
- CRLF / `core.autocrlf` — a scripted edit that matches nothing and reports success → the
  Verification-traps section of `.claude/rules/app.md` (`#crlf`). Graduated by fleet-lint run 4.
- The `<bdi>` rule reaching **seven** recorded occurrences → CLAUDE.md iron rule 5 (rewritten to
  lead with `<bdi>`) + the Bidi section of `.claude/rules/app.md` (`#bidi-bdi`).
- Git Bash silently drops a `TZ=` value containing a slash → Time section, same file.
- `israelDayKey` in `src/lib/transcripts.ts` closed the last user-visible Israel-time gap.

**One belief in this file that is no longer true:** the ">2MB Pinge snip stripped silently" FINDING
is **CLOSED** — `PdfViewer.tsx:232` refuses the capture, a localized toast renders at 6 call sites,
`attachments.test.ts` asserts the exact boundary. Verified and filed to cross-cutting 2026-08-10.

**Also superseded:** `.claude/rules/app.md` was split and restructured 2026-08-10 (4,121 → 2,351
words). Laws live there; the forensic stories moved to `docs/case-history/app.md`, linked by anchor.
If you remember quoting app.md by position, cite the anchor instead.
