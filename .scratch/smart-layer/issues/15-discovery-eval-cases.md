# Discovery eval cases — broad questions with known leads

Type: task
Status: open

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
