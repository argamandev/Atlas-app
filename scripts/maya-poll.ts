// THE ~10-MINUTE POLLER — half one of slice A5's freshness layer.
//
//   node --import tsx scripts/maya-poll.ts --dry-run
//   node --import tsx scripts/maya-poll.ts
//
// ONE MAYA REQUEST answers "what has the whole market published lately", so a
// filing published at 09:00 is searchable by about 09:15. That is the ticket's
// acceptance — a fresh filing searchable ≤ ~15 min after publication — and this
// is the cheap path to it.
//
// IT IS NOT THE GUARANTEE. The feed is a fixed-length window over every issuer on
// the exchange, and an earnings-season burst outruns it: measured 2026-08-14,
// mid-season, 298 rows of which 76 were corpus-eligible in a single snapshot. A
// company that files while 300 other disclosures land can fall off the end before
// any poll sees it. The coverage guarantee is the nightly sweep — which is
// `backfill-maya-corpus.ts` run again, per-company and idempotent, not a second
// implementation of this. Both go through `syncCompanyFilings`, so a sweep and a
// poll racing on one filing converge on one row (ingestion standard §7).
//
// ATLAS HOLDS 233 OF ~1,630 TASE ISSUERS, so most of what the feed reports is for
// a company we do not carry. Those are skipped and COUNTED — a poll that quietly
// discarded nine tenths of the market would look identical to one that was working.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { reindexDocument } from '../src/lib/corpus/reindex'
import type { CorpusDb } from '../src/lib/corpus/reindex'
import { latestDisclosures } from '../src/lib/maya/disclosures'
import { toRemoteSources } from '../src/lib/maya/filings'
import type { RemoteSource } from '../src/lib/maya/filings'
import { syncCompanyFilings, realSyncDeps, describeOutcome } from '../src/lib/maya/syncFilings'
import { ingestFiling } from '../src/lib/maya/ingestFiling'
import { describeFailure } from '../src/lib/maya/types'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const f of ['.env.local', '.env']) {
  const p = join(HERE, '..', f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const DRY = process.argv.includes('--dry-run')
const log = (...a: unknown[]) => console.log(...a)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
if (!process.env.MAYA_API_KEY) throw new Error('MAYA_API_KEY required')
const raw = createClient(url, serviceKey, { auth: { persistSession: false } })
const db = raw as unknown as CorpusDb

type CompanyRow = { id: string; name: string; tase_issuer_id: string | null }

async function main() {
  const started = new Date().toISOString()
  const feed = await latestDisclosures()
  if (!feed.ok) {
    // A FAILED POLL IS A FAILURE, loudly and with a non-zero exit, so whatever
    // schedules this can tell "MAYA was down" from "nothing was published".
    console.error(`[maya-poll] feed unavailable — ${describeFailure(feed.failure)}`)
    process.exit(1)
  }

  const sources = toRemoteSources(feed.data)
  log(
    `[maya-poll] ${started} · ${feed.data.length} disclosures → ${sources.length} corpus-eligible` +
      `${DRY ? '  [DRY RUN]' : ''}`
  )
  if (!sources.length) {
    log('[maya-poll] nothing of ours in this window — the ordinary result')
    return
  }

  const byIssuer = new Map<number, RemoteSource[]>()
  for (const s of sources) byIssuer.set(s.issuerId, [...(byIssuer.get(s.issuerId) ?? []), s])

  // `companies.tase_issuer_id` is TEXT while MAYA's issuerId is a number — a
  // pre-existing type mismatch migration 019 records, and both writers spell it
  // String(issuerId). Matching on anything else silently finds no company.
  const issuerIds = Array.from(byIssuer.keys()).map((n) => String(n))
  const { data, error } = await raw
    .from('companies')
    .select('id, name, tase_issuer_id')
    .in('tase_issuer_id', issuerIds)
  if (error) throw new Error(`[maya-poll] loading companies failed: ${error.message}`)
  const companies = (data as CompanyRow[] | null) ?? []
  const byIssuerId = new Map(companies.map((c) => [String(c.tase_issuer_id), c]))

  const notOurs = issuerIds.filter((id) => !byIssuerId.has(id))
  log(
    `[maya-poll] ${byIssuerId.size} of ${issuerIds.size ?? issuerIds.length} issuers are companies Atlas carries` +
      ` · ${notOurs.length} skipped as not ours`
  )

  let ingested = 0
  let failed = 0
  for (const [issuerId, issuerSources] of Array.from(byIssuer.entries())) {
    const company = byIssuerId.get(String(issuerId))
    if (!company) continue

    const report = await syncCompanyFilings(
      realSyncDeps({
        db,
        companyId: company.id,
        supabaseUrl: url!,
        serviceRoleKey: serviceKey!,
        ingestFiling,
        reindexDocument,
      }),
      { companyId: company.id, sources: issuerSources, dryRun: DRY }
    )
    // ONLY SAY SOMETHING WHEN SOMETHING HAPPENED. This runs every ten minutes
    // forever; a line per company per poll is a log nobody reads, and a log
    // nobody reads is where a failure hides.
    const notable = report.outcomes.filter((o) => o.status !== 'held')
    if (notable.length) {
      log(`  ${company.name}:`)
      for (const o of notable) log(`    ${describeOutcome(o)}`)
    }
    ingested += report.ingested
    failed += report.failed
  }

  log(`[maya-poll] done · ${ingested} ingested, ${failed} failed`)
  // A poll that failed to ingest something it found must not report success to
  // the scheduler — that is the difference between a retry and a silent gap.
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error('[maya-poll] FAILED:', e)
  process.exit(1)
})
