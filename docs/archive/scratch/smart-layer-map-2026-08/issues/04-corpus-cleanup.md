# Corpus cleanup — only what serves Atlas

Type: task
Status: resolved

## Question

Founder decision 2026-08-12: Timlul is dead; the 55 unattributed transcripts (of 60) go.
Steps, in order — reversible until the last one: (1) verify nothing live serves those rows,
(2) export them to cold storage, (3) delete, (4) confirm the 5 attributed transcripts
remain and the app renders clean. Then inventory the remaining Timlul-era leftovers in the
database and codebase (e.g. dormant `src/lib/correction.ts`) and report them to the founder
for a go/no-go per class — deletion is destructive and each class gets his explicit call.
Record what the cleanup implies for iron rule #1 (CLAUDE.md still says Supabase is shared
with production Timlul).

## Answer

Resolved 2026-08-12. The 55 unattributed transcripts are exported, deleted, and the app
verified clean. The leftovers inventory is below, one go/no-go per class for the founder.

### What was done, in order

1. **Verified nothing live serves the 55 rows.** Two-sided check. Code side (full sweep of
   every `transcripts` read path): the only unfiltered readers are the workspace source
   picker (`src/lib/workspace/intake/corpus.ts`), global `/chat` grounding
   (`src/lib/chat/context.ts:31`), and `GET /api/transcripts` (no in-app consumer) — all
   list-then-shrink; nothing pins a legacy id. DB side (live queries): **zero** references
   to any doomed row from `scheduled_calls` (whose FK has no ON DELETE rule and would have
   hard-failed the delete), `quotes`, `workspace_items` (CASCADE — would have silently
   deleted user shelf items), `chat_conversations`, or `user_quotes`. The live-finish demo
   call `live-finish-demo-tamis-2026-06-14` — hardwired as `DEMO_CALL_ID` in
   `src/app/api/live/finish/route.ts` — is among the 5 attributed survivors, not the doomed set.
2. **Exported to cold storage.** `scripts/export-timlul-transcripts.mjs` (new, committed)
   wrote one JSON per row + `manifest.json` to
   `C:\Users\Sagi\Desktop\Atlas-cold-storage\timlul-transcripts-2026-08-12\` (~3.2 MB), then
   re-read every file and matched its id against the manifest: 55/55 verified.
3. **Deleted.** `DELETE FROM transcripts WHERE company_id IS NULL` returned **55**. Filed in
   `COLLISIONS.md`. No migration file — DML, not DDL; schema untouched.
4. **Confirmed the app is clean.** DB after: 5 transcripts, 0 unattributed;
   workspace_items 3, quotes 19, chat_conversations 27 — no collateral. Eyes-on in Chrome
   (signed in, RTL): company page תיגבור (latest-call card plays), transcript view
   `/app/live/PyuMxe88e8g` (full text, speakers, timeline), `/app/chat` (history intact),
   `/app/workspace` (all workspaces render, the תיגבור-sourced one included). Zero console
   errors after hard refresh. `npm test` 700/700 green, `npx tsc --noEmit` clean.

### Timlul-era leftovers — go/no-go per class

**Class A — five empty tables no code touches: `user_quotes`, `watchlist`,
`notification_prefs`, `sent_alerts`, `seen_reports`.** All 0 rows; no `.from('…')` anywhere
in `src/` (only i18n strings mention watchlists). `user_quotes` additionally has RLS enabled
with zero policies — the abandoned shape flagged in `db.md`. Dropping them is `DROP TABLE`
(hook-blocked destructive DDL), so per db.md it goes: founder yes → migration file → review →
apply. **Recommend: drop all five.**

**Class B — orphaned storage.** 7 of 11 objects in the `audio-temp` bucket (~44 MB) belong to
deleted Timlul transcripts or pipeline scratch; the other 4 are the audio of surviving calls
(list = the `audio_url` of the 5 remaining rows; everything else in the bucket is orphaned).
The empty `product-images` bucket is residue of the foreign project whose tables were deleted
2026-07-16. **Recommend: delete the 7 orphans and the empty bucket.**

**Class C — dormant code: `src/lib/correction.ts` (+ `correction.test.ts`,
`scripts/run-experiment.ts` which imports it).** No production import — `transcription.ts`
takes only a type from `./types`. Git-reversible. **Recommend: delete all three files.**

**Class D — kept, named for completeness.** `quotes`/`quote_folders`/`followed_calls`/
`access_requests`/`profiles` are live Atlas features (MyQuotes UI, admin requests), not
leftovers. The LEGACY.md 4-file login gateway is live login infrastructure. The npm package
name is still `investor-transcription` — cosmetic, rename whenever convenient.

### What this implies for iron rule #1

The rule's premise is now false: the old Timlul Railway deployment was retired 2026-08-08
(Atlas took its project + service), and as of today no Timlul data remains that Atlas does
not serve. Nothing but Atlas runs against this database. The protections the rule mandates
(additive-only, three hook-blocked doors, COLLISIONS.md-before-migration) remain fully
justified — but by a different fact: **this database is Atlas production** (live at
www.timlul-ai.com). Recommended rewording, for the founder to approve since it is an iron
rule: "Supabase is Atlas PRODUCTION — live users' data. Additive-only migrations…" etc.,
mechanism unchanged. Side effect: db.md's caveat "do not fix `profiles`/`access_requests`
`USING (true)` policies without checking Timlul first" dissolves — Timlul can no longer
depend on them, so those two Supabase-linter findings become actionable (candidate for a
future ticket, not done here).
