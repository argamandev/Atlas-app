# Speaker-edit authorization — corpus curation or personal write?

Type: grilling
Status: claimed

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
