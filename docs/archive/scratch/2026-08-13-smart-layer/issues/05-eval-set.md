# The eval set — real questions with known answers

Type: task
Status: resolved

## Question

Build the measurement corpus that decides retrieval quality: ~10–20 real, fund-style
questions in Hebrew over our actual transcripts and filings, each with a documented correct
answer and its source anchor (call · line id / filing · page). The founder supplies and
validates the questions (HITL). Must include the workspace-intake regression as a must-pass
case: a mid-conversation company correction reaches the resolver
(`resolveIssuer('בית זיקוק אשדוד')` → 1361 is the proved expected answer).

This set outlives the map: every future retrieval change is judged against it.

## Answer

The eval set exists, is founder-approved, and lives at
[`docs/eval/retrieval-eval-set.md`](../../../docs/eval/retrieval-eval-set.md) — 18 cases,
every anchor verified against the live database on 2026-08-12. Approved in full ("the
questions look good, approve everything and resolve the ticket", filed in `DECISIONS.md`):

- **Two MUST-PASS binary gates:** the workspace-intake regression (mid-conversation
  correction reaches `resolveIssuer('בית זיקוק אשדוד')` → 1361) and the בז"א alias case
  (fails today by design — the alias table from ticket 01 must close it).
- **Negative policy approved:** an answer that cannot be grounded in the corpus says so,
  cites nothing, fabricates nothing (Case 17).
- **Attribution ruling approved (Case 15):** content mis-attributed to a company's
  `company_id` must never be presented as that company's management speaking — the honest
  answer says no such statement exists in the corpus.
- **Six corpus warts documented (W1–W6)** in the file: the Zim/Knesset hearing carries
  Tigbur's `company_id` (fix decision added to ticket 13), a duplicate transcript, the Tamis
  demo distractor, ASR garbles (תפעולי→טיפולי, EBITDA→העבידה), Aura's `ð` extraction
  corruption, and all-zero timestamps (line id is the only anchor — "call · minute" is not
  buildable from today's corpus).

Ticket 07 (the measured eval) is now unblocked: it scores candidate designs A/B/C from
ticket 01 against this set.

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
