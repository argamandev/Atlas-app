# Keeping the corpus fresh — the two scheduled jobs

**FACTS and operating instructions, not laws.** Loaded when the ingestion schedule is
being touched. The laws these obey live in `docs/INGESTION-STANDARD.md`.

Slice A5 built three entry points into the corpus. All three go through
`syncCompanyFilings` (`src/lib/maya/syncFilings.ts`), which is the single door — so a
poll, a sweep and a user's click racing on one filing converge on one row, as the
standard §7 requires. None of them is a second implementation of the birth sequence.

---

## The two jobs

| | command | cadence | cost per run |
| --- | --- | --- | --- |
| **Poller** | `node --import tsx scripts/maya-poll.ts` | every ~10 min | 1 MAYA request + whatever is new |
| **Sweep** | `node --import tsx scripts/backfill-maya-corpus.ts` | nightly | ~900 MAYA reads, ~0 otherwise |

**The sweep IS the backfill script.** That is deliberate, not a shortcut: "latest of each,
for every company" run again is exactly the coverage guarantee, and the script is
idempotent — a filing already held and indexed costs one row in a batched read and nothing
else. Writing a separate sweep would have been a second copy of the same decisions.

**Why both.** The poller is the fast path: one request answers "what has the market just
published", so a filing published at 09:00 is searchable by about 09:15. It is not a
guarantee — the feed is a fixed-length window over every issuer on the exchange, and it
was measured carrying 298 rows mid-earnings-season. A company can fall off the end before
any poll sees it. The nightly sweep catches that.

---

## Scheduling them — NOT YET CONFIGURED

⚠ **Neither job is scheduled anywhere today.** Both scripts work and have been run by
hand; nothing runs them on a timer, so freshness is currently manual. Closing that is a
Railway change and needs the founder — it is a dashboard action, not a repo change.

Railway runs a cron service by giving a service a schedule and a start command, against
this same repo and its existing environment variables. Two services:

```
maya-poll    */10 * * * *    node --import tsx scripts/maya-poll.ts
maya-sweep   0 2 * * *       node --import tsx scripts/backfill-maya-corpus.ts
```

Both need `MAYA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`GEMINI_API_KEY` (embeddings). Both refuse to start without the first three rather than
running half-blind.

**They exit non-zero when something failed to ingest that they found**, so a scheduler that
alerts on failure will alert. A poll that finds nothing of ours exits 0 and says so — that
is the ordinary result, not a problem.

**Do not run the sweep and a manual backfill at the same time.** They will not corrupt
anything (the identity keys and the 23505 catch see to that), but they will race for the
same MAYA rate budget — 10 requests / 2 seconds for the whole key, shared with every
interactive user.

---

## Reading what they did

`/app/admin/corpus` — the index-status screen. Transcripts and filings by state, chunk
count, XBRL facts, and the list of anything that has not finished indexing. Admin only.

`index_status` is `pending` → `indexed` | `failed` | `excluded`; `failed` is retryable by
law and a re-run picks it up without re-downloading the PDF.

---

## Known limits, stated rather than discovered

- **~15% of selected presentations cannot be stored** — `company_documents` is unique on
  `(company_id, quarter, doc_type)` and a deck with no quarter event id keys on its year.
  Measured at 207 of 1,385 across 91 companies. The runs NAME every displaced filing;
  nothing is lost silently. Full numbers and the three ways out:
  `docs/evidence/feat-smart-layer-a5-maya-backfill/measurements.md` §2.
- **The poller only sees issuers Atlas carries** — 233 of ~1,630. The rest are counted and
  skipped, never silently discarded.
- **`.htm`-only filings are out of scope**, not a bug: `src/lib/maya/filings.ts` requires a
  PDF, and most immediate disclosures carry only the MAYA `.htm` wrapper. Immediate
  disclosures are measured out of scope entirely (ticket 17).
