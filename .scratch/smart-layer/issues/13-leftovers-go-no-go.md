# Timlul leftovers + iron rule #1 — founder go/no-go

Type: grilling
Status: resolved

## Question

Ticket 04's cleanup left a per-class menu that only the founder can decide (deletion is
destructive; each class gets his explicit call — see the inventory in
[ticket 04's answer](04-corpus-cleanup.md)):

1. **Class A** — drop the five empty, code-untouched tables (`user_quotes`, `watchlist`,
   `notification_prefs`, `sent_alerts`, `seen_reports`)? If yes: migration file → review →
   apply, per db.md's DDL gate.
2. **Class B** — delete the 7 orphaned `audio-temp` objects (~44 MB) and the empty
   `product-images` bucket?
3. **Class C** — delete dormant `src/lib/correction.ts` + its test +
   `scripts/run-experiment.ts`?
4. **Zim hearing attribution** (added 2026-08-12 by ticket 05) — transcript `2gXp90F8s6w`
   (Knesset committee hearing on the Zim sale) carries Tigbur's `company_id`, though no
   Tigbur speaker appears in it. The eval set's Case 15 rules the ANSWER side (mis-attributed
   content never speaks for the company); the founder decides the DATA side: correct the
   attribution (to what? Zim isn't a TASE issuer in `companies` — check), null it, or delete
   the transcript as non-corpus material.
5. **Iron rule #1** — approve rewording CLAUDE.md's premise from "Supabase is SHARED with
   production Timlul" to "Supabase is Atlas PRODUCTION" (mechanisms unchanged)? And does the
   db.md caveat about not touching the `profiles`/`access_requests` `USING (true)` policies
   (previously "check Timlul first") become a scheduled fix?

6. **PUT `/api/transcripts/[id]`** (added mid-grilling from `docs/open-findings.md`, which
   routed it here) — the owner-or-admin full-content PUT bypasses the admin-only speaker
   curation gates from ticket 12. Owner-exception, admin-only, or field-restricted?

## Answer

Resolved 2026-08-13, grilled as an option menu (selections filed verbatim in `DECISIONS.md`).
All six items decided:

1. **Class A — GO.** Drop the five empty tables (`user_quotes`, `watchlist`,
   `notification_prefs`, `sent_alerts`, `seen_reports`). Destructive DDL → per the db.md gate:
   migration file first, reviewer on the file, `COLLISIONS.md`, then apply.
2. **Class B — GO** (confirmed on an explicit follow-up: *"Go for both, too"*). Delete the 7
   orphaned `audio-temp` objects (~44 MB; keep the 4 belonging to surviving calls' `audio_url`)
   and the empty `product-images` bucket.
3. **Class C — GO.** Delete `src/lib/correction.ts`, `correction.test.ts`,
   `scripts/run-experiment.ts`. Git-reversible.
4. **Zim hearing — export + delete.** Fact checked live this session: ZIM Integrated Shipping
   is not in `companies` — the only "צים" is רני צים (issuer 1588, shopping centers), a
   different company — so re-attribution was never an option. Transcript `2gXp90F8s6w` goes to
   cold storage (same pattern as the 55: export → verify → delete), leaving 4 corpus
   transcripts. Note: eval Case 15 (mis-attribution) loses its live specimen — the eval set's
   case stands as policy; its fixture must not depend on this row surviving.
5. **Iron rule #1 — reworded** (done in this session: CLAUDE.md + db.md premise lines).
   New premise: "Supabase is Atlas PRODUCTION — live users' data." Every mechanism unchanged.
   The `profiles`/`access_requests` `USING (true)` narrowing is **scheduled** as its own small
   mission (open-findings entry updated; the "check Timlul first" blocker is dissolved).
6. **PUT `/api/transcripts/[id]` — admin-only.** Full-content transcript edits are corpus
   curation exactly like speaker renames; no owner-exception enters the curation law. Closes
   the question in `docs/open-findings.md`; the fix is a small mission with route tests, same
   shape as ticket 12's.

### Execution missions this unlocks (none executed here — wayfinder plans)

- **Cleanup mission** (one branch): Class A migration → review → apply; Class B storage
  deletion; Class C file deletion; Zim export + delete (reuse
  `scripts/export-timlul-transcripts.mjs`'s pattern with an id filter).
- **Policy-narrowing mission**: `profiles` + `access_requests` `USING (true)` → owner-scoped,
  through the DDL gate (DROP/ALTER POLICY is hook-blocked destructive SQL — founder-approved
  here, still reviewed on the file first).
- **PUT admin-only mission**: `requireAdmin` on PUT `/api/transcripts/[id]` + non-admin→403
  route tests.
