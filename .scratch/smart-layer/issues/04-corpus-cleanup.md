# Corpus cleanup — only what serves Atlas

Type: task
Status: open

## Question

Founder decision 2026-08-12: Timlul is dead; the 55 unattributed transcripts (of 60) go.
Steps, in order — reversible until the last one: (1) verify nothing live serves those rows,
(2) export them to cold storage, (3) delete, (4) confirm the 5 attributed transcripts
remain and the app renders clean. Then inventory the remaining Timlul-era leftovers in the
database and codebase (e.g. dormant `src/lib/correction.ts`) and report them to the founder
for a go/no-go per class — deletion is destructive and each class gets his explicit call.
Record what the cleanup implies for iron rule #1 (CLAUDE.md still says Supabase is shared
with production Timlul).
