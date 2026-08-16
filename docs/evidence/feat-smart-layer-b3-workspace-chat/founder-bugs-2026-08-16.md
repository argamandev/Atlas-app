# Two founder-reported bugs — evidence

**Branch** `feat/smart-layer-b3-workspace-chat` · **Driven** 2026-08-16 · dev server `:3000`,
signed in as the founder, Chrome MCP.

Both bugs were reported against **דנאל** (issuer 314, company `3e238e6c-…`).

---

## Bug 1 — the documents tab offered `שנתי 2026`

### What the founder saw, and why

Live MAYA for issuer 314, read 2026-08-16 (this is the ground truth the fix was designed against,
not a reconstruction):

| published | title | event ids |
| --- | --- | --- |
| 2026-05-19 16:22 | `דוח רבעון 1 לשנת 2026` | `[104]` |
| 2026-05-19 16:47 | `מצגת שוק ההון- מאי 2026` | **`[101, 270]`** |
| 2026-07-13 | Q2 conference-call notice | `[105,113,233]` — correctly excluded |

`periodFor` took the annual code from `101` and the year from the **month name** in the title, so
the capital-markets deck was labelled `FY 2026`; `FY` sorts first within a year, so 2026 led with
`שנתי 2026`. The same row is stored that way in production `company_documents`.

### The rule's blast radius, measured — not argued

Cold review called the first version of this rule a **BLOCKER**, correctly: it also checked reports,
and against a year it had *inferred* when the title stated none, which for an annual can never pass.
I had reasoned that class was rare rather than counting it. Counting it is what chose the design.

`node --import tsx scripts/measure-period-labels.ts` — all 233 issuers, 2022–2026, old label vs new:

| version of the rule | filings measured | lost their place on the tab |
| --- | --- | --- |
| first (reports too, inferred years) | 8,804 | **99** — 81 decks, 13 annual, 5 quarterly |
| shipped (decks only, stated years) | 8,804 | **81 — every one a deck, zero reports** |

The 18 reports the first version threw out are why the rule is narrowed: פרוספקט's results are a
**real, closed** fiscal Q3 that only a calendar-quarter assumption calls impossible, and most of the
rest were forecasts wearing the annual code (בזק's `תחזית לשנת 2025`) — a separate defect, now in
`docs/open-findings.md`.

**WHAT THE 81 ARE, CORRECTED.** An earlier draft of this file said they are the founder's class
exactly — `מצגת שוק ההון - מרץ YYYY`, named by the month the deck was made. **Round 7 enumerated all
81 and that is true of most but not all of them.** At least three name the period they COVER rather
than the month they were made: ישראכרט `מצגת משקיעים-רבעון 2 שנת 2025` `[101,270]`, סולאיר
`מצגת שוק הון- רבעון 2 2024` `[101,270]`, אלמוגים `…נכון לדוחות 30.9.21` `[106,270]`. Those are
**genuine results decks that lose a quarter they were entitled to** — the rule reaches for the next
code the filing carries, and a `[101,270]` deck carries only the annual one, so it falls to a date.
It stops them claiming to be the annual report, which was the defect; it does not give them the Q2
slot they deserve. Reading the quarter out of a deck's TITLE would (`workspace/tabLabel.quarterOf`
already does this for tab chips) and is deliberately not attempted here — it is a third source of
truth on the same label and wants its own measurement. Folded into the open finding below.

⚠ The committed instrument prints only the NON-presentation losses (`measure-period-labels.ts:115`),
which is why the first draft's claim went unchecked. The count it reports is right; the
characterisation of the set was mine, and it was not measured.

### States enumerated, then driven

Re-driven after the review changes, per 8c — the rule was narrowed from all filings to decks after
the first drive, so every row below was earned twice.

| # | State | Driven | Result |
| --- | --- | --- | --- |
| 1 | 2026 expanded, EN | ✅ re-driven | Only `Q1 2026`. No `Annual` row. |
| 2 | 2026 expanded, HE | ✅ re-driven | Only `Q1 2026`. No `שנתי` row. RTL correct. |
| 3 | A year whose annual legitimately exists, EN | ✅ re-driven | 2025 → `Annual 2025`, Q3, Q2, Q1. Intact. |
| 4 | A year whose annual legitimately exists, HE | ✅ re-driven | 2025 → `שנתי 2025`, Q3, Q2, Q1. Intact. |
| 5 | Loading state on the year | ✅ | `טוען מסמכים מהבורסה…` while MAYA is fetched, then the periods. |
| 6 | Results deck `[104,270]` keeps its quarter | ❌ not driven in a browser | דנאל files no such deck. Held by `events.test.ts` and by the untouched Tigbur case in `filings.test.ts`. |
| 7 | A report the rule would have refused (non-calendar fiscal year) | ❌ not driven | פרוספקט is not one of the 233 companies with a profile page to click. Held by the `[106]` case in `events.test.ts` and by the sweep above, which is the stronger evidence — it is every issuer, not one screen. |
| 8 | A filing with an unparseable publication date | ❌ cannot be forced | MAYA would have to emit a malformed `publicationDate`. Held by the existing "never an exception" case, which the fix leaves on its original path. |
| 9 | The already-stored bad row in `company_documents` | ❌ not driven | Deliberately not rewritten. See "Left undone" — and note the correction there. |

**Rows 3/4 matter most**: they prove the rule refuses only *impossible* annuals rather than annuals
in general. 2026 losing its row while 2025 keeps its own also proves the catalog was freshly derived
and not served from `catalogCache`.

---

## Bug 2 — "Atlas could not answer — this grounding cannot be honoured"

### Cause

`/app/company/[id]/period/[period]` fabricates `period:<companyId>:<period>` as a routing key when
a quarter has documents but no recording. `LiveTranscriptView` decided the chat grounding with
`call.id !== 'demo'` — a proxy that named one screen without a stored row and could not see this
one — so it sent `{kind:'call', transcriptId:'period:…:Q1 2026'}`. The route's `asTranscriptId`
requires `[A-Za-z0-9_-]`; two colons and a space fail it, so the turn 400'd before any lookup.

### States enumerated, then driven

Re-driven after review, per 8c — the caption stopped reading a `transcriptId` prop and now reads the
grounding itself, so every caption row was earned twice.

| # | State | Driven | Result |
| --- | --- | --- | --- |
| 1 | Period **without** a transcript — דנאל Q1 2026, HE | ✅ re-driven | Answers. `POST /api/chat/v2` → **200** (was 400). First drive: revenue ₪729,576k from XBRL. After review: net profit ₪42.15M vs ₪32.9M in Q1 2025. |
| 2 | Its caption | ✅ re-driven | `אטלס מחובר להקשר של החברה הזאת` — the company. Previously promised the call. |
| 2b | Its **hero and sub-line**, HE + EN | ✅ driven at round 7 | "Ask anything **about this company**", and the "the audio keeps playing while you ask" line is **absent**. Round 7 found both were still promising a call in 29px type directly above the corrected caption — the same lie in a second and third input, on the screen this branch fixed. I had verified the caption and read past the headline; that is the M4 failure this row now records. |
| 3 | Period **with** a transcript — תיגבור Q1 2026, HE + EN | ✅ re-driven | Caption `…של השיחה הזאת` / "connected to this call's context"; hero "about this call"; the audio line **present**, because there is audio. **All three inputs agree in both directions — that A/B is the proof the fix did not simply blanket-rename the screen.** |
| 4 | Slides pane with no document for the period | ✅ | `אין מסמך לתקופה זו` — honest empty state, no stub. |
| 5 | Console during both | ✅ | Zero errors. |
| 6 | `{kind:'none'}` — the caption's third state | ❌ not driven | Reachable only on the demo call when `getCompanyByTicker` fails, which needs the ticker missing from the database. It is the state cold review found the old caption lying in; it now has its own string (`askConnectedMarket`) and its own case in `askGrounding.test.ts`. **Not driven, and the test is what holds it.** |
| 7 | The demo call (`/app/live/demo`) | ❌ not driven | Unchanged by construction: `id === 'demo'` and `storedTranscriptId === null` are the same answer for that screen. Held by `askGrounding.test.ts`. |
| 8 | Admin speaker editing / diarization / print on a period page | ❌ not driven | Needs admin edit mode on a screen that now correctly refuses it. Three more sites that read the same proxy; each is now `storedTranscriptId`, and `canEdit` is false without one. No test drives the UI path. **This is the thinnest row in the table.** |
| 9 | Quote saved from a period page | ❌ not driven | Would have written the synthetic id into `quotes`; now writes `null`. Not driven because it is a production write. |
| 10 | EN locale, both directions | ✅ driven at round 7 | Company side and call side both read correctly in English. Previously this row was ❌; the hero fix forced the drive and it is now earned. |

**Row 8 is the honest gap.** It covers behaviour that is now more restrictive than before, so the
risk is a feature refusing where it should allow — visible, not silent.

---

## Found while verifying, NOT fixed

- **`<<<ATLAS-SOURCE>>>` fence markers leak into visible answers.** Filed in
  `docs/open-findings.md`. Not caused by this work — the period page used to 400 on every
  question, so it had never rendered an answer for the leak to appear in. Chat quality is
  eval-gated and owned by a parallel session.
- **`מצבת התחייבויות` filings can win a period's report slot.** Filed in `docs/open-findings.md`.

## Left undone, deliberately

- The one poisoned production row (דנאל, `quarter='FY 2026'`, `doc_type='slides'`,
  `maya_report_id=1742288`) is not rewritten.
  **CORRECTION — an earlier draft of this file said it "re-derives correctly on the next backfill or
  poll". That is false, and cold review caught it.** `syncCompanyFilings` returns `held` and
  `continue`s for any row already `index_status='indexed'` (`syncFilings.ts:236`), and `quarter` is
  written only at `ingestFiling.ts:64`. That row is indexed — verified against production — so it
  never heals on its own and keeps feeding `FY 2026` to the model through
  `chat2/documentInjection.ts`. Fixing it is a one-row `UPDATE` on live production, which is the
  founder's call to make awake, not mine to make overnight. The catalog on screen is already correct
  because the documents tab reads MAYA live.
- The battery has **one failing test that predates and is unrelated to this work**:
  `environment.test.ts` "the always-on set is exactly the declared set" finds a second `CLAUDE.md`
  inside `.claude/worktrees/new-worktree-setup-35b4ef/`, a registered git worktree created during
  this session and sitting at `main`'s tip with no commits of its own. Not touched — it may be the
  parallel session's workspace. Everything else is green: **1182 pass, 1 fail** at this tip,
  `tsc` clean. (An earlier draft said 1176 — a count carried across edits, which is M1's own
  example. Regenerated from a run of this tree.)
