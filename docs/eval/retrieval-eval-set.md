# Retrieval eval set — real questions with known answers

Status: draft — awaiting founder validation (smart-layer ticket 05)
Created: 2026-08-12

**What this is.** The measuring stick for retrieval quality. Every case is a real, fund-style
question over the actual corpus, with a documented correct answer and its source anchor
(transcript · line id / document · page). The retrieval eval (ticket 07) scores candidate
designs against this set, and after the smart layer ships, **every future retrieval change is
judged against it** — this file outlives the wayfinder map.

**How to read a case.** `Q` is the question as a user would ask it (Hebrew, natural phrasing).
`Expected` is the documented answer. `Anchor` is where the answer verifiably lives — checked
against the live database on 2026-08-12. `Tests` says which failure mode the case exists to
catch. A retrieval design passes a case when the anchored source is in what it retrieves and
the anchor supports the expected answer.

**Scoring note.** Cases marked MUST-PASS are binary gates: a design that fails one is rejected
regardless of its average score. Everything else contributes to a recall/precision score per
design (exact metric defined in ticket 07).

---

## Corpus snapshot this set was drafted against

- 5 transcripts (4 distinct — see W2): two Tigbur investor calls (FY2025 `hii8RivJK9I`,
  Q1-2026 `PyuMxe88e8g`), a Knesset committee hearing on the Zim sale (`2gXp90F8s6w`), a Tamis
  live-demo recording (`live-finish-demo-tamis-2026-06-14`), and a duplicate of the Q1 call
  (`PyuMxe88e8g_live`).
- 23 documents / 2,549 pages across Tigbur, בתי זיקוק (Bazan), דוראל אנרגיה, יעקב פיננסים,
  אאורה, תורפז.

### Known corpus warts (facts, discovered 2026-08-12 — retrieval must survive them)

- **W1 · Mis-attribution:** the Knesset/Zim hearing `2gXp90F8s6w` carries Tigbur's
  `company_id` although no Tigbur speaker appears in it. Case 14 exists because of this.
- **W2 · Duplicate:** `PyuMxe88e8g_live` is the same call as `PyuMxe88e8g` (39 vs 40 lines).
  Case 17 exists because of this.
- **W3 · Non-call content:** the Tamis transcript is a garbled mic-test/demo (Context7 MCP
  chatter), not an investor call. It is a natural distractor — no case should ever retrieve it.
- **W4 · ASR garble:** the Tigbur transcripts say «הרווח הטיפולי» for «הרווח התפעולי»,
  «ההעבידה» for EBITDA, «אגוסה ליהלומים» for «הבורסה ליהלומים», «מבצע שהגעת הארי» for the
  operation name. Lexical search on the user's correct word will miss the garbled source.
- **W5 · Broken extraction:** אאורה report pages render נ as `ð` («עירוðית», «ציוðית»),
  sabotaging lexical match on those pages.
- **W6 · No usable timestamps:** every line in every transcript carries `timestamp 00:00:00`.
  The line id (`L0001`…) is the only real anchor; a "minute" citation cannot be built from
  this corpus today (matches the foundation review).

---

## A. Single-source lookup — transcript

**Case 01 — annual headline numbers**
Q: מה היו ההכנסות של קבוצת תיגבור בשנת 2025 ובכמה הן צמחו?
Expected: ההכנסות חצו 1.5 מיליארד ש"ח, צמיחה של 13.3% — צמיחה אורגנית (שכר המינימום תרם כ-4.5–5%).
Anchor: transcript `hii8RivJK9I` · L0008
Tests: basic recall on the strongest surface form (numbers stated once, plainly).

**Case 02 — profit ladder**
Q: מה היה הרווח התפעולי, הרווח הנקי וה-EBITDA של תיגבור ב-2025?
Expected: רווח תפעולי 58 מיליון ש"ח (+13.8%), רווח נקי 40 מיליון ש"ח (+16%), EBITDA כמעט 80 מיליון ש"ח (+15%).
Anchor: transcript `hii8RivJK9I` · L0009
Tests: W4 head-on — the source says «הרווח הטיפולי» and «האיבידה»; the user's correct
vocabulary must still find it.

**Case 03 — dividend policy**
Q: מה מדיניות הדיבידנד של תיגבור?
Expected: חלוקה של 50% מהרווחים, באופן עקבי אחת לרבעון; הדיבידנד הרבעוני צמח מ-4–5 מיליון ש"ח לכ-19–20 מיליון ש"ח.
Anchor: transcript `hii8RivJK9I` · L0040
Tests: policy question phrased abstractly; answer is mid-presentation, not in Q&A.

**Case 04 — quarterly headline numbers**
Q: מה היו התוצאות של תיגבור ברבעון הראשון של 2026?
Expected: הכנסות 359 מיליון ש"ח; EBITDA 18 מיליון; רווח תפעולי 12.5 מיליון; רווח נקי 9.4 מיליון
(לעומת 10.2 ברבעון המקביל); הון עצמי מעל 210 מיליון; דיבידנד 4.7 מיליון ש"ח.
Anchor: transcript `PyuMxe88e8g` · L0010
Tests: picking the RIGHT quarter — the corpus holds FY2025 and Q1-2026 calls for the same
company; also W2 (the duplicate transcript carries the same content).

**Case 05 — capital raise purpose**
Q: כמה גייסה תיגבור לאחרונה ולאיזו מטרה?
Expected: גיוס של כ-36 מיליון ש"ח, מיועד לרכישת חברות סינרגטיות — בתחום הסיעוד/פתרונות בקהילה ובטכנולוגיות אבטחה.
Anchor: transcript `PyuMxe88e8g` · L0030 + L0031 (question and answer are separate lines)
Tests: answer spans a Q&A pair — a one-line window loses either the sum or the purpose.

**Case 06 — headcount**
Q: כמה עובדים מעסיקה קבוצת תיגבור?
Expected: מעל 20,000 עובדים ברמה חודשית (ברמה שנתית יותר).
Anchor: transcript `hii8RivJK9I` · L0051
Tests: fact stated once, in passing, deep in the presentation.

## B. Single-source lookup — filing page

**Case 07 — Doral operating capacity**
Q: כמה מגה-וואט בהפעלה מסחרית יש לדוראל אנרגיה?
Expected: כ-1,173 מגה-וואט (DC) בהפעלה מסחרית, נכון ל-31 במרץ 2026.
Anchor: document `דוח רבעון 1 לשנת 2026` (דוראל אנרגיה, id `12e3ae21…`) · page 5
Tests: numeric fact inside a 225-page filing; page-as-chunk hypothesis from ticket 01.

**Case 08 — Yaakov Finansim half-year profit**
Q: מה היה הרווח הנקי של יעקב פיננסים במחצית הראשונה של 2026?
Expected: כ-46.43 מיליון ש"ח רווח נקי לתקופה שהסתיימה 30.6.2026; היקף עסקאות כ-4.04 מיליארד ש"ח.
Anchor: document `מצגת משקיעים רבעון שני לשנת 2026` (יעקב פיננסים, id `556f1680…`) · page 8
Tests: slides-deck extraction — numbers detached from sentence structure.

**Case 09 — Bazan refining capacity (alias in the question)**
Q: מה כושר הזיקוק השנתי של בז"ן?
Expected: כ-9.8 מיליון טון זיקוק נפט גולמי בשנה (ומגזר הפולימרים כ-800 אלף טון בשנה).
Anchor: document `מצגת משקיעים לדוחות רבעון שלישי 2025` (בתי זיקוק, id `bab90cbd…`) · page 3
Tests: the company is stored as «בתי זיקוק»; the user says «בז"ן». Exercises the alias
decision from ticket 01 (MAYA data not embedded; alias table instead).

## C. Cross-source agreement

**Case 10 — call vs. filing on the same number**
Q: האם ההכנסות שהציגה תיגבור בשיחת הרבעון הראשון 2026 תואמות את הדוח הרבעוני?
Expected: כן — בשיחה נאמר 359 מיליון ש"ח; בדוח, טבלת המגזרים מציגה מחזור פעולות של 359,403 אלפי ש"ח.
Anchor: transcript `PyuMxe88e8g` · L0010 **and** document `דוח רבעון 1 לשנת 2026` (תיגבור, id
`e231c676…`) · page 29 — both required.
Tests: multi-source retrieval for one answer; unit mismatch (מיליונים vs אלפי ש"ח).

## D. Q&A-section retrieval

**Case 11 — reserve-duty impact**
Q: כמה עובדים של תיגבור נמצאים במילואים ואיך זה השתנה?
Expected: ב-2025 בממוצע כ-300 איש במילואים; מהראשון במרץ עלה לכ-450.
Anchor: transcript `hii8RivJK9I` · L0066
Tests: answer lives only inside a Q&A reply, phrased conversationally.

**Case 12 — new security tenders**
Q: באילו מכרזי אבטחה חדשים זכתה תיגבור ולכמה זמן?
Expected: מקורות, המוסד לביטוח לאומי, הבורסה ליהלומים, וועדת הבחירות — מכרזים חדשים לחמש שנים, עד סוף 2031.
Anchor: transcript `PyuMxe88e8g` · L0021
Tests: W4 — the source says «אגוסה ליהלומים»; list-valued answer.

## E. Company resolution — MUST-PASS

**Case 13 — MUST-PASS · the workspace-intake regression**
Q: (mid-conversation, after the user first said something else) «התכוונתי לבית זיקוק אשדוד»
Expected: the correction reaches the resolver: `resolveIssuer('בית זיקוק אשדוד')` → issuer
**1361**. Proved 2026-08-12 (`docs/archive/cross-cutting-2026-07-03--2026-08-10.md`; the
frozen first-turn at `intake/route.ts:87` is the defect). Binary: a design where a
mid-conversation correction cannot reach the resolver is wrong by construction.
Tests: the tool-boundary defect this whole chapter treats as its acceptance test.

**Case 14 — alias resolution**
Q: מה המרווח האחרון של בז"א?
Expected: the question must reach בתי זיקוק content (issuer 1361). Today
`resolveIssuer('בז"א')` → null — this case documents the known gap the alias table (ticket
01 decision) must close. Fails today; must pass in the chosen design.
Tests: Hebrew acronym aliasing with gershayim; MAYA `name_en` is NULL for all 233 issuers.

## F. Adversarial and negative

**Case 15 — attribution trap (W1)**
Q: מה אמרה הנהלת תיגבור על מכירת צים?
Expected: הנהלת תיגבור לא התייחסה לכך. The Zim material lives in a Knesset committee hearing
that merely carries Tigbur's `company_id`; presenting committee speakers as "הנהלת תיגבור"
is a wrong answer. The honest answer says no Tigbur-management statement exists in the
corpus (and may point out the hearing as adjacent material).
Tests: metadata cannot be trusted blindly; the citations law's "an answer that cannot be
grounded says so visibly".

**Case 16 — the mis-attributed content is still findable**
Q: כמה אוניות של צים יישארו בבעלות ישראלית לפי הדיון בכנסת?
Expected: 12 מתוך כ-160 אוניות (בדיון הוזכר תחילה 16 ותוקן ל-12).
Anchor: transcript `2gXp90F8s6w` · L0253–L0256
Tests: answer assembled across four consecutive short lines, including a self-correction —
a window cut mid-exchange returns the WRONG number (16).

**Case 17 — unanswerable, must say so**
Q: מה היה הרווח הנקי של טבע ב-2025?
Expected: אין לכך מקור בקורפוס — the system must say it cannot ground an answer, cite
nothing, and fabricate nothing. (טבע has no transcript and no document in the corpus.)
Tests: the citations founding law, negative direction.

**Case 18 — duplicate discipline (W2)**
Q: any Tigbur Q1-2026 question (e.g. Case 04) rerun.
Expected: the answer cites the canonical `PyuMxe88e8g`, and the `PyuMxe88e8g_live` duplicate
does not produce a second, conflicting citation or double-weighted retrieval.
Tests: duplicate handling; citation stability.

---

## Founder validation — what is asked of Sagi (ticket 05, HITL)

1. **Realism pass:** are these the questions a fund analyst actually asks? Rephrase freely —
   the wording should be his, not the agent's.
2. **Add real ones:** questions he or users have genuinely wanted answered, especially for
   אאורה / תורפז / דוראל (the draft is Tigbur-heavy because the transcripts are).
3. **Rule on Case 15:** confirm the expected behavior for mis-attributed content (this also
   feeds the ticket-13 decision about cleaning `2gXp90F8s6w`'s attribution).
4. **Approve the MUST-PASS gates** (Cases 13, 14) and the negative-case policy (Case 17).

On approval this file's Status flips to `approved`, ticket 05 resolves, and ticket 07 (the
measured eval) unblocks.
