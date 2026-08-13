# The Ingestion Standard — how a document is born

**Status: STANDARD — founder-approved 2026-08-13** (smart-layer ticket 16; his decisions
quoted in `DECISIONS.md`). Grounded in laws already approved: the measured retrieval shape
(`../.scratch/smart-layer/research/07-retrieval-eval-results.md`), the architecture
(ticket 08), and the MAYA structured-data facts
(`../.scratch/smart-layer/research/14-maya-structured-data.md`).

**Scope: the SHARED corpus** — call transcripts and MAYA filings, the data every user
searches. Personal rows (workspaces, quotes, agents) are governed by `docs/DATA-MODEL.md`,
not this standard. Scale questions (which filings, how far back, on what trigger) are
ticket 17's; this standard fixes the per-document sequence ticket 17's pipeline must obey.

---

## The birth sequence

Every document joins the corpus through the same steps, in order. A document that has not
completed a step is visibly in that state — never silently half-born (app.md: degradation
must be VISIBLE).

1. **Identity** — compute the real-world identity key; already in the corpus → stop and
   point at the existing row.
2. **Attribution** — resolve the TASE issuer; no company, no corpus row.
3. **Content** — extract text (existing pipelines: IVRIT/RunPod + Gemini polish for calls;
   pdf.js RTL reassembly for filings — `src/lib/documents/extract.ts`).
4. **Anchors** — stable line ids + real per-line timestamps (transcripts); page numbers
   (filings).
5. **Chunks + embeddings** — the measured shapes; derived data, rebuildable.
6. **Facts + publication date** — XBRL structured facts; `publication_date` (filings).

---

## 1 · Identity — dedup at birth

**LAW · A corpus document's identity is its real-world source, never our row id.**
- Transcript identity = the source event: YouTube/Vimeo video id, or the live call
  (`scheduled_calls` row / Recall bot). Stored as `source_key`; UNIQUE index.
- Filing identity = `mayaReportId` (already law: `company_documents_maya_report_uniq`,
  migration `20260806_019`).

The `PyuMxe88e8g_live` lesson: `scripts/retranscribe-call.ts` checked only "does the NEW id
collide" and wrote the same Tigbur call twice; the duplicate then outranked its twin in
every retrieval design (eval finding 6) and confused intake and debugging. No ranker fixes
a duplicate — it dies at this door.

**LAW · Re-processing updates the SAME row.** Minting a sibling id (`<id>_live`,
`<id>_r<ts>`) for one real-world event is banned; comparison runs happen off-corpus (dev
DB or a `status` that excludes the row from search — never a second corpus row).

**LAW · Demo/test content never enters the corpus.** The demo finish paths write rows the
chunker and search must not see (excluded by status/flag).

Duplicate attempt UX (founder-approved): the user is told it's already in the archive and
taken to the existing document — never a silent twin, never a silent overwrite.

**ENFORCED (owed at build):** UNIQUE index on `transcripts.source_key`; the birth choke
point (below) computes it; a route test feeds a known-duplicate source and asserts
already-exists, not a second row.

## 2 · Attribution — born attributed

**LAW · `company_id` is resolved before the row exists.** No unattributed corpus rows,
ever again (founder decision 2026-08-12, filed in `DECISIONS.md`). Company scoping was the
single biggest measured retrieval multiplier (eval finding 4) — an unattributed row is
invisible to the very filter that makes search good, and the 55-row Timlul export is the
proof this cannot be retrofitted.

- Live calls — **the main door from here on** (founder 2026-08-13: "All of the
  transcripts will come from live investor calls being transcribed from now on, or we
  will delicately create a backlog of transcripts"): the company rides in from scheduling
  (`scheduled_calls` carries the issuer) — resolved when the bot is created, not guessed
  from a ticker at finish time (today `finishLiveCall.ts` resolves after the fact and
  quietly stores null on a miss).
- Backlog imports: admin-curated; the company is picked at import. The company-page
  upload button is non-essential and may be removed — if it stays, it requires the
  company before the pipeline starts. Fewer doors never weakens the law; every remaining
  door obeys it.
- Filings: already safe — `ingestDocument()` requires `companyId`, DB column is NOT NULL.
- Content about no TASE issuer (the Zim/Knesset hearing class) does not enter Atlas.
- Mis-attribution stays a corpus-curation fix: admin-only edit (ticket 12's law), and the
  W1 guard ("no management statement exists") lives at the answer layer, per the eval set.

**LAW · One birth door per corpus type.** Today seven code paths insert `transcripts`
rows with no shared gate (M3: fix at the choke point). The standard mandates a single
birth function in `src/lib/db/transcripts.ts` that takes `company_id` + `source_key` as
REQUIRED arguments; every route/script/finish path calls it. `ingestDocument()` already is
this for documents — copy its shape, don't reinvent it.

**ENFORCED (owed at build):** `transcripts.company_id` NOT NULL at the DB (additive
`CHECK … NOT VALID` → `VALIDATE`, all current rows pass); a battery test that greps/parses
for `.from('transcripts').insert` outside the birth module (the apiAuthBoundary pattern).

## 3 · Content — extraction stays as shipped

Existing pipelines are the standard: IVRIT primary ASR with `word_timestamps: true`,
Gemini polish (`formatTranscript()`), pdf.js RTL line reassembly with magic-byte
validation (`%PDF-`, and BOM+`<?xml` for XBRL). Known warts W4 (ASR garble) and W5
(broken glyph extraction) are quality items, not ingestion gates — a garbled page still
ingests; hybrid retrieval was chosen partly because dense bridges garble (eval finding 3).

## 4 · Anchors — citations are born, not retrofitted

**LAW · Every transcript line carries a stable id AND a real timestamp at birth.**
`L####` ids exist today; timestamps are hard-coded `'00:00:00'` (`transcription.ts:507`)
while real word timings from IVRIT/Recall already sit in `word_segments`. At birth, the
pipeline aligns polished lines to the timed word stream (the `loadCall.ts` alignment, run
once and PERSISTED, with a firmer join than the proportional map where word text allows)
and writes per-line start times. This makes the founding citation law ("Q1 call · 14:02 ·
L0031") real — W6 closes for every new transcript.

The founder's karaoke observation is the confirming fact: playback IS in sync because the
word-level timings are real — the player just re-derives the alignment at every page load
instead of it being persisted. Existing 5 transcripts (founder-approved): backfill
per-line times where `word_segments` exist; lines that cannot be timed keep line-id-only
citations, visibly; **no re-processing of old audio**.

**LAW · `formatted_data`, `word_segments` and chunks are ONE consistency unit.**
Regenerating any of them re-runs alignment and re-chunks in the same operation
(`reprocess-audio.mjs` today regenerates word timings while keeping `formatted_data` —
that desync becomes impossible, not discouraged).

Filings: `page_no` is the anchor, already law. Splitting an oversized page never loses it.

## 5 · Chunks + embeddings — the measured shapes, verbatim content

**LAW · Chunk shapes are the eval-measured ones** (changing them = a harness re-run, the
standing gate at `scripts/retrieval-eval/`):
- **Transcripts**: line-windows cut on speaker seams inside a section — accumulate to
  TARGET 700 chars, cut at a speaker change past target, hard-cut at MAX 1,100; carry
  `first_line_id`/`last_line_id`, speakers, section (validated: keeps Q&A pairs together,
  eval finding 7).
- **Filings**: page-as-chunk; pages over 3,500 chars split on line boundaries into
  ~2,200-char parts, every part keeping `page_no`.

**LAW · `content` is verbatim and citable; `embedding_input` = deterministic metadata
prefix + content; they are separate columns and the prefix NEVER enters `content`.**
(Removing the prefix collapsed retrieval — rank 1 → 417, eval finding 2; mixing it into
content breaks `source_quote` drift comparison — the forbidden shape from research/01 §7.)
Measured prefix formats:
- transcript: `{company} · שיחת ועידה · {section} · {speakers}:`
- filing: `{company} · {title} · עמ' {N}` (+ part marker when split)

**LAW · One chunker.** Production and the eval harness use the SAME chunking module —
a harness measuring a copy certifies a fiction (M2).

**LAW · Embeddings are `gemini-embedding-001` @1536 (MRL, re-normalized).** OpenAI is
ruled out for Hebrew by measurement (2/15 vs 7/15). The lexical channel ships as the
dual-indexed `tsvector 'simple'` shape (surface + prefix-stripped ו/ה/ב/ל/מ/ש/כ forms) —
gated by one harness re-run against real Postgres before the Chat rewrite ships, because
the eval's BM25 was an in-process simulation.

**LAW · Chunks are derived data.** Rebuildable at any time from the source row; carry the
source `revision`; rebuilt atomically on re-processing (delete + reinsert in one
transaction — a reader never sees half a transcript's chunks). Embedding calls are
hash-cached (the harness pattern) so an unchanged chunk re-embeds for free.

**LAW · An embedding failure is visible, never silent.** The document keeps an
`index_status` (`pending`/`indexed`/`failed`); a failed embed retries; search never
pretends an unindexed document doesn't exist — the status is queryable and surfaces in
admin. A chunk row without its embedding is not a success state (M3.3).

## 6 · Structured facts + publication date (filings)

**LAW · `ingestFiling()` parses the `.xbrl` attachment when present** → `filing_facts`
rows (the 26 `ifrs-full` concepts + `ifrs-il` metadata: MAGNA ref, receipt time, auditor,
review qualification), keyed by `mayaReportId`. No LLM, no rate-limit cost (public file
host). Guards (from research/14): body must be XML (BOM + `<?xml`), a 200 HTML page is a
failure; a missing 26-fact set = "no structured facts", NEVER zeros; foreign-track issuers
(ICL-shaped, no ISA XBRL) get a visible "no structured facts" flag, not silence.

**LAW · `publication_date` is recorded at birth** — the additive column on
`company_documents`, filled from MAYA's `publicationDate` (already carried as
`publishedISO` and dropped at the door today). The shipped embarrassment this closes:
Atlas told an analyst a 2020 annual report was published on 07.08.2026 — the afternoon we
ingested it. `created_at` is ingestion time, a different fact, and is never shown as the
publication date.

## 7 · Where the pipeline runs, and the MAYA budget

- Ingestion runs in the Next.js server process (request-time today: upload route, live
  finish, `documents/open`, workspace from-maya). Ticket 17 may add scheduled sweeps —
  they invoke the SAME birth sequence per document; idempotency comes from the identity
  keys, so a sweep and a user click racing on one filing converge on one row (the
  `23505`-catch-and-reread pattern from `from-maya/route.ts` is the template).
- **LAW · All MAYA API calls flow through one process-global limiter** at the
  `client.ts` chokepoint (10 req / 2s is one budget for the whole key; today's 220ms gap
  is per-call-site and two concurrent users each get their own pacing — that gap becomes
  global). `mayafiles.tase.co.il` downloads are unmetered but magic-byte validated.
- 429 stays surfaced, not silently retried-forever.

## 8 · Re-processing and drift — the honest story

When a transcript re-polishes (`reformatPipeline`, `reformat.mjs`, admin curation):

1. Same row, `revision + 1`. L-ids renumber from scratch — that is why anchors carry
   `source_quote` snapshots downstream.
2. Alignment re-runs → fresh per-line timestamps.
3. Chunks + embeddings rebuild atomically for that source (hash cache keeps cost ~0).
4. Anything citing the old text (saved quotes, workspace blocks, agent findings) compares
   its `source_quote` snapshot at render: match → live citation; mismatch → **"drifted"**,
   visibly — never a plausible lie, never a silent rebind (ticket 08 law; curation
   propagation is the ticket-12 exception, admin renames flow through).

## The migration list this standard implies

All through the DDL gate (`.claude/rules/db.md`: file → review → COLLISIONS.md → apply);
all additive:

1. `CREATE EXTENSION vector` — justified by measurement (ticket 07).
2. `document_chunks` — shared-corpus shape (NO `user_id`; copy `20260714_012`'s RLS:
   `FOR SELECT TO authenticated USING (true)`): `id`, `source_type`, `transcript_id` TEXT
   / `document_id` uuid (exactly-one CHECK), `company_id`, `revision`, `first_line_id`/
   `last_line_id` XOR `page_no` (+ part), `section`, `speakers`, `content` (verbatim),
   `embedding_input`, `embedding vector(1536)`, HNSW index, dual-form tsvector column +
   GIN, index on `company_id`.
3. `filing_facts` — shared-corpus shape; `mayaReportId` key, concept, value numeric,
   currency, period start/end, source metadata.
4. `ALTER TABLE company_documents ADD COLUMN publication_date timestamptz`.
5. `transcripts`: `ADD COLUMN source_key text`, `ADD COLUMN revision int NOT NULL
   DEFAULT 1`, UNIQUE index on `source_key` (partial, WHERE NOT NULL until backfilled),
   `CHECK (company_id IS NOT NULL) NOT VALID` → backfill/verify → `VALIDATE CONSTRAINT`.
6. (Owned by ticket 08's build, referenced here: `company_aliases` — attribution's
   resolver feeds this standard's step 2.)

## Backfill — the standard applied to what already exists (founder-approved)

One-time pass, order: publication dates for the 23 documents (one `by-issuer` read per
company under the global limiter) → XBRL facts where the filing carries one → `source_key`
backfill for the 5 transcripts → timestamp alignment where `word_segments` exist →
chunk + embed everything (~3,200 chunks ≈ $0.35, hash-cached). Ticket 17 decides how much
MORE filing history joins; this backfill only brings the EXISTING corpus up to standard.

**The backfill doubles as the pipeline's proving ground** (the founder's own framing:
"That's also the way to try out and see our search and chunking methods (rag pipeline)
actually works"). Acceptance: after the backfill, the standing 18-case harness
(`scripts/retrieval-eval/`) re-runs against the REAL pipeline — pgvector + the real
Postgres lexical channel — and must reproduce the measured eval results before any
user-facing surface ships on it.

---

## Laws → mechanisms owed (ADR-0002 accounting)

| Law | Mechanism owed at build time |
| --- | --- |
| One birth door, attributed | battery test: no `transcripts` insert outside the module; DB CHECK |
| Dedup at birth | UNIQUE `source_key`; duplicate-upload route test |
| content/embedding_input separation | schema (two columns) + a test that `content` never starts with a prefix pattern |
| One chunker | harness imports the production module (impossible tier) |
| Real timestamps at birth | pipeline test: new transcript has non-zero line times when word timings exist |
| Atomic re-chunk on regeneration | transaction + test driving a reformat and asserting chunk/revision consistency |
| Global MAYA limiter | unit test on the client chokepoint |
| Visible index status | `index_status` column + UI/admin surface (M4 check at review) |
