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
4. **Iron rule #1** — approve rewording CLAUDE.md's premise from "Supabase is SHARED with
   production Timlul" to "Supabase is Atlas PRODUCTION" (mechanisms unchanged)? And does the
   db.md caveat about not touching the `profiles`/`access_requests` `USING (true)` policies
   (previously "check Timlul first") become a scheduled fix?
