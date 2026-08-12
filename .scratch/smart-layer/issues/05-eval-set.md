# The eval set — real questions with known answers

Type: task
Status: open

## Question

Build the measurement corpus that decides retrieval quality: ~10–20 real, fund-style
questions in Hebrew over our actual transcripts and filings, each with a documented correct
answer and its source anchor (call · line id / filing · page). The founder supplies and
validates the questions (HITL). Must include the workspace-intake regression as a must-pass
case: a mid-conversation company correction reaches the resolver
(`resolveIssuer('בית זיקוק אשדוד')` → 1361 is the proved expected answer).

This set outlives the map: every future retrieval change is judged against it.
