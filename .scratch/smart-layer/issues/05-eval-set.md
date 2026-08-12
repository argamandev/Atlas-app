# The eval set — real questions with known answers

Type: task
Status: claimed

## Question

Build the measurement corpus that decides retrieval quality: ~10–20 real, fund-style
questions in Hebrew over our actual transcripts and filings, each with a documented correct
answer and its source anchor (call · line id / filing · page). The founder supplies and
validates the questions (HITL). Must include the workspace-intake regression as a must-pass
case: a mid-conversation company correction reaches the resolver
(`resolveIssuer('בית זיקוק אשדוד')` → 1361 is the proved expected answer).

This set outlives the map: every future retrieval change is judged against it.

## Comments

**2026-08-12 — draft filed, awaiting founder validation.** 18 cases drafted at
[`docs/eval/retrieval-eval-set.md`](../../../docs/eval/retrieval-eval-set.md), every anchor
verified against the live database (transcript line ids read in full, document pages
fetched). Includes the MUST-PASS intake regression (Case 13) and an alias case that fails
today by design (Case 14, `בז"א` → null). Five corpus warts documented in the file (W1–W6),
the biggest being: the Knesset/Zim hearing `2gXp90F8s6w` carries Tigbur's `company_id` with
no Tigbur speaker in it (feeds ticket 13), and all transcript timestamps are `00:00:00`, so
line id is the only anchor. Resolution needs Sagi's four validation acts listed at the
bottom of the eval file; then Status flips to approved, this ticket resolves, and ticket 07
unblocks.
