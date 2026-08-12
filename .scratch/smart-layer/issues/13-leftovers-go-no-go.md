# Timlul leftovers + iron rule #1 — founder go/no-go

Type: grilling
Status: open

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
