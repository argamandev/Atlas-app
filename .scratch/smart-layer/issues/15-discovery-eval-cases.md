# Discovery eval cases — broad questions with known leads

Type: task
Status: resolved

## Question

The founder's reframe (ticket 07): the general case is market-wide discovery — "asking a
broad question and finding leads." The eval set (`docs/eval/retrieval-eval-set.md`) is
pinpoint-heavy and does not measure that mode at all. Add 2–3 real discovery cases: broad
sector/market questions **in the founder's own words** (HITL — e.g. "which companies talked
about reserve-duty costs?"), each with the documented set of correct leads (companies +
anchor each) verified against the live corpus, per the eval-set law. Then mirror them into
`scripts/retrieval-eval/cases.json` with a `mode: "discovery"` scoring rule (a case passes
when every known lead company appears in the diversified top-k) and rerun the harness so
search mode's quality is measured, not assumed — the same law that caught the OpenAI-Hebrew
failure.

## Answer

Resolved 2026-08-13. Two discovery cases added — class G in
`docs/eval/retrieval-eval-set.md`, mirrored as `mode: "discovery"` in
`scripts/retrieval-eval/cases.json` — and measured.

**The questions (HITL, 2026-08-13).** The founder picked the themes from a measured menu of
what actually crosses companies in the live corpus, and the phrasings are his: **case 19**
«אילו חברות דיברו על עלויות מילואים?» (his own ticket-07 example) and **case 20** «אילו
חברות דיברו על בינה מלאכותית?» (offered, approved as-is). He was offered war-impact and
cyber as further themes and free rephrasing; he chose these two.

**The leads (verified against the live DB 2026-08-13, anchor each).**
- Case 19: **תיגבור** (transcript `hii8RivJK9I` L0066: 300→450 במילואים; transcript
  `PyuMxe88e8g` L0004: 300→650 מאבטחים during שאגת הארי — W4 garble; filing Q1-2024 p.3:
  ~800 called up, ~200 still serving) and **בית זיקוק אשדוד** (annual 2024 p.12: ~50
  employees, ~11% of workforce). יעקב פיננסים/תורפז/דוראל mention מילואים only as macro war
  boilerplate — documented as NON-leads; distinguishing them is an answer-layer precision
  judgment, deliberately not gated by the harness.
- Case 20: **דוראל** (AI data-center demand + AI for solar output), **בתי זיקוק** (AI/ML
  raising electricity demand), **תורפז** (AI tools in flavor development), **תיגבור** (call
  mention, `PyuMxe88e8g` L0006) — four leads, two source kinds; W2's duplicate collapses
  into the Tigbur lead under per-company diversification.

**The scoring rule.** Market-wide ranking (no scope), diversified per company (companies
ordered by best chunk); pass = all lead companies within the top 5 of that order. Per-lead
`anchorRank` is recorded as answer-layer evidence, never gated — a lead found via a
different-but-relevant chunk still counts.

**Measured (run `scripts/retrieval-eval/results/run-2026-08-12T22-01-26.md`).** The decided
design **C-gemini passes both** (19: all leads @ company-rank 2; 20: @ rank 4). Dense-only
B-gemini FAILS case 20 (בתי זיקוק at rank 7 — the lexical channel is what rescues it, more
evidence for hybrid); C-openai fails 19, B-openai fails both. The discovery gate
discriminates the same way the pinpoint set did in ticket 07.

**Side observation, not this ticket's scope:** the corpus has grown since the 08-12 run
(26 docs / 3,031 pages; בז"א filings + Tigbur quarterlies), so this run's pinpoint numbers
are not comparable to the 08-12 report — within-run design comparison is what the gate
measures.
