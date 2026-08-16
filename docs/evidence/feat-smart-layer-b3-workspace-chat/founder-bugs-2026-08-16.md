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

### States enumerated, then driven

| # | State | Driven | Result |
| --- | --- | --- | --- |
| 1 | 2026 expanded, EN | ✅ | Only `Q1 2026`. No `Annual` row. |
| 2 | 2026 expanded, HE | ✅ | Only `Q1 2026`. No `שנתי` row. RTL correct. |
| 3 | A year whose annual legitimately exists, EN | ✅ | 2025 → `Annual 2025`, Q3, Q2, Q1. Intact. |
| 4 | A year whose annual legitimately exists, HE | ✅ | 2025 → `שנתי 2025`, Q3, Q2, Q1. Intact. |
| 5 | Results deck `[104,270]` keeps its quarter | ❌ not driven in a browser | דנאל has no such filing to click. Held by `events.test.ts` (`[105,270]` → `Q2 2025`) and by the untouched `filings.test.ts` Tigbur case (`[104,270]` → `Q1 2026`). |
| 6 | A filing with an unparseable publication date | ❌ cannot be forced | MAYA would have to emit a malformed `publicationDate`. Held by the existing "never an exception" case in `events.test.ts`, which the fix leaves on its original path. |
| 7 | The already-stored bad row in `company_documents` | ❌ not driven | Deliberately NOT rewritten — no unattended production writes. See "Left undone". |

**State 3/4 is the one that matters most**: it proves the rule refuses only *impossible* annuals
rather than annuals in general. 2026 losing its row while 2025 keeps its own also proves the
catalog was freshly derived and not served from `catalogCache`.

---

## Bug 2 — "Atlas could not answer — this grounding cannot be honoured"

### Cause

`/app/company/[id]/period/[period]` fabricates `period:<companyId>:<period>` as a routing key when
a quarter has documents but no recording. `LiveTranscriptView` decided the chat grounding with
`call.id !== 'demo'` — a proxy that named one screen without a stored row and could not see this
one — so it sent `{kind:'call', transcriptId:'period:…:Q1 2026'}`. The route's `asTranscriptId`
requires `[A-Za-z0-9_-]`; two colons and a space fail it, so the turn 400'd before any lookup.

### States enumerated, then driven

| # | State | Driven | Result |
| --- | --- | --- | --- |
| 1 | Period **without** a transcript — דנאל Q1 2026, HE | ✅ | Answers. `POST /api/chat/v2` → **200** (was 400). Revenue ₪729,576k, cited from XBRL. Second question also answered. |
| 2 | Its caption | ✅ | `אטלס מחובר להקשר של החברה הזאת` — the company. Previously promised the call. |
| 3 | Period **with** a transcript — תיגבור Q1 2026, HE | ✅ | Caption `אטלס מחובר להקשר של השיחה הזאת` — the call. **Call grounding is preserved; only the lying case changed.** |
| 4 | Slides pane with no document for the period | ✅ | `אין מסמך לתקופה זו` — honest empty state, no stub. |
| 5 | Console during both | ✅ | Zero errors. |
| 6 | The demo call (`/app/live/demo`) | ❌ not driven | Unchanged by construction: it moves from `id === 'demo'` to `storedTranscriptId === null`, which are the same answer for that screen. Held by `askGrounding.test.ts`. |
| 7 | Admin speaker editing / diarization / print on a period page | ❌ not driven | Needs the admin edit mode on a screen that now correctly refuses it. These were three more sites reading the same proxy; each is now `storedTranscriptId`, and `canEdit` is false without one. No test drives the UI path. **This is the thinnest row in the table.** |
| 8 | Quote saved from a period page | ❌ not driven | Would have written the synthetic id into `quotes`; now writes `null`. Not driven because it is a production write. |
| 9 | EN locale for states 1–3 | ❌ not driven | The strings are dictionary keys already exercised in HE, and the panel is the same component. Called out rather than claimed. |

**Rows 7 and 9 are the honest gaps.** Row 7 covers behaviour that is now more restrictive than
before, so the risk is a feature refusing where it should allow — visible, not silent.

---

## Found while verifying, NOT fixed

- **`<<<ATLAS-SOURCE>>>` fence markers leak into visible answers.** Filed in
  `docs/open-findings.md`. Not caused by this work — the period page used to 400 on every
  question, so it had never rendered an answer for the leak to appear in. Chat quality is
  eval-gated and owned by a parallel session.
- **`מצבת התחייבויות` filings can win a period's report slot.** Filed in `docs/open-findings.md`.

## Left undone, deliberately

- The one poisoned production row (דנאל, `quarter='FY 2026'`, `doc_type='slides'`) is not
  rewritten. It re-derives correctly through the same `periodFor` on the next backfill or poll.
- The battery has **one failing test that predates and is unrelated to this work**:
  `environment.test.ts` "the always-on set is exactly the declared set" finds a second `CLAUDE.md`
  inside `.claude/worktrees/new-worktree-setup-35b4ef/`, a registered git worktree created during
  this session and sitting at `main`'s tip with no commits of its own. Not touched — it may be the
  parallel session's workspace. Everything else is green: **1176 pass, 1 fail**, `tsc` clean.
