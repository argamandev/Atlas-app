# Review — feat/smart-layer-foundations (slice A1)

Cold review by the atlas-reviewer subagent, three rounds:

1. **Pre-apply (the DDL gate):** the six migration files reviewed BEFORE any SQL touched
   production — APPROVED, with one WARNING (finishLiveCall's markProcessing stub upserts
   discarded their supabase error; recurrence of "gating changes every caller's error
   path"). That finding was fixed and bought `src/lib/supabaseWriteDiscipline.test.ts`
   (the law's third occurrence → a tier-stronger mechanism, per ADR-0002); the scan then
   flushed two more real sites, both fixed (admin requests approve/reject answered ok:true
   over a refused write; the /api/transcripts company-link update was unread).
2. **Full-branch re-review:** CHANGES — caught the df95218 STATUS.md rewrite pushing the
   always-on set to 9047/9000 (red battery at the tip) and two hand-carried counts that a
   later edit had falsified. Fixed in 309a486 (trim; the stale spare-token count deleted
   outright). Both findings named M1 (a meta-law): meta-laws are invisible to the gate's
   law parser by explicit founder deferral (2026-08-12, DECISIONS.md), so the mechanism
   question is carried to the founder in the ship report rather than answered on this
   branch — the reviewer's candidate mechanisms are recorded in the final verdict's prose.
3. **Final verdict at the tip, copied verbatim below.**

---

All claims verified with my own runs at `309a486`: battery 706/706 (0 fail), always-on set 8996/9000 (4 spare), tsc clean, working tree clean, and the trim commit touches only STATUS.md. The diff of the trim is pure compression — the A1 standing consequence (unattributed inserts fail at the DB; A3 birth door; A4 VALIDATE), the A2 next-up, and the deferred-calls record all survive intact, and it deletes the hand-written spare-token count outright (the commit message names that as deliberate — the M3-shaped fix: the state that could lie is removed, not corrected). PROGRESS.md:938's "Verified: 706/706" is now true of the tree that carries it. Both of my previous findings are closed at this tip; everything else on the branch was verified in the prior round and `309a486` changed none of it. I also confirmed the coordinator's parser claim myself: `lawBlocks` in `scripts/lib/env-manifest.mjs` enumerates only `**LAW · ` markers, so a `yes → M1` line would name nothing the gate can match — the deferral (2026-08-12, DECISIONS.md) makes that machinery explicitly not this branch's call.

REVIEWED: 309a48631e2d6562fc4eb21a5dcc948d6ecde02a
VERDICT: APPROVED
FINDINGS: none

Prose for the founder's ship report, outside the grammar, as offered: yes — I judge the count-carrying defect worth a standing record beyond this fix. It is M1's exact clause ("a count restated from another document — wrong every time it was hand-carried"), it fired on this branch twice (the stale `8969` and the stale `706/706`), and the gate's law parser cannot see M1 by design until the deferred meta-law work happens. Two cheap candidate mechanisms, in preference order: (1) `ship:gate` re-runs the battery and refuses a merge whose newest PROGRESS entry asserts a `Verified: N/N` that disagrees with the run it just made — that closes the specific recurring shape at the ritual-gate tier without touching the meta-law machinery; (2) the convention this trim already applied — never write a token/test count into a budgeted file; point at the command instead — which costs nothing but lives at the prose tier. Until one lands, this defect class is caught only where it was caught both times here: by someone re-running the commands at review.
