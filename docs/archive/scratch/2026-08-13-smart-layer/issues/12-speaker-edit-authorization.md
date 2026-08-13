# Speaker-edit authorization — corpus curation or personal write?

Type: grilling
Status: resolved

## Question

The foundation review (ticket 03) found that `PATCH /api/transcripts/[id]/speakers` and
`PATCH /api/transcripts/[id]/diarization` let ANY signed-in user rewrite speaker attribution
on ANY transcript — and the speakers path also rewrites every user's saved quotes on that
call with caller-chosen text (`src/lib/db/transcripts.ts:7-35`,
`src/lib/db/quotes.ts:166-184`). The same row's PUT requires owner-or-admin, so the write
rules on one transcript are incoherent.

The founder decides: in a shared corpus, is fixing a speaker name **corpus curation** (an
admin-gated quality act that benefits everyone) or a **personal write** (owner-gated, like
the PUT)? The answer decides the fix for the live defect AND the write-authorization pattern
the smart layer's own routes copy. Evidence:
[`research/03-foundation-review.md`](../research/03-foundation-review.md), slice 3.

## Answer

Resolved 2026-08-13 by founder grilling (his words in `DECISIONS.md`, [2026-08-13] entry:
*"1A 2A Q3 okay q4 a"*). Four calls:

1. **Speaker attribution is corpus curation — ADMIN-ONLY** (his 1A, stricter than the
   session's owner-or-admin recommendation). A speaker's name is a fact about the call,
   the same for everyone, so fixing it is a curation act like deleting a transcript.
   `PATCH /api/transcripts/[id]/speakers` and `PATCH .../diarization` get `requireAdmin`,
   matching the row's existing DELETE/PATCH gates. Consequence for the UI truthfulness law:
   non-admins must not see a speaker-edit affordance that would 403 — hide it, don't let it
   fail.
2. **Renames propagate into everyone's saved quotes** (his 2A). `renameSpeakerInQuotes`
   stays cross-user *by design* — the quote's speaker label is derived from corpus
   attribution, so correcting the corpus corrects the quotes. The defect was only that
   anyone could trigger it; once the route is admin-gated, propagation is a feature.
3. **This is the smart layer's written authorization law** (his "Q3 okay"): writes to
   shared-corpus rows are **curation** — admin-gated; personal rows are written only by
   their owner; the single sanctioned exception is corrections flowing from corpus curation
   into derived personal data (this ticket's propagation). Filed in `docs/DATA-MODEL.md`;
   the **Curation** glossary term joins `CONTEXT.md` with the spec's one deliberate
   always-on edit (per the map's Notes), not now.
4. **Fix now** (his "q4 a") — a small separate mission immediately after this ticket:
   gate the two routes admin-only, with route tests asserting non-admin → 403 (the
   boundary test scans auth resolution, not post-auth authorization — the exact gap these
   routes fell through, so the mechanism is a new test, not prose).
