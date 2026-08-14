// THE MAYA DEMO BACKFILL — "latest of each" for every TASE issuer Atlas knows.
//
//   node --import tsx scripts/backfill-maya-corpus.ts --dry-run
//   node --import tsx scripts/backfill-maya-corpus.ts --dry-run --limit=5
//   node --import tsx scripts/backfill-maya-corpus.ts --company=בזן
//   node --import tsx scripts/backfill-maya-corpus.ts            ← THE REAL RUN
//
// Slice A5. Founder-approved depth, 2026-08-13, option B in his own words: *"I
// would like us to pay the least amount and for the shortest time possible …
// since we are building here an amazing demo"* — the most recent quarterly, the
// most recent annual, and 12 months of presentations, for all 234 companies.
// ≈ 55–70K pages, ≈ $5–8 of embeddings, once.
//
// IT IMPLEMENTS NOTHING. Every decision it needs already exists and is tested:
//   selectLatestOfEach   the depth       (src/lib/maya/latestOfEach.ts)
//   syncCompanyFilings   what to spend   (src/lib/maya/syncFilings.ts)
//   ingestFiling         the birth sequence, steps 3–6
// This file is the loop, the resumability and the arithmetic — and if it ever
// starts making a fourth kind of decision, that decision belongs in a module with
// a test, not here (M2: the backfill must run what production runs).
//
// RESUMABLE AND IDEMPOTENT, because a run of 234 companies WILL be interrupted.
// Nothing is remembered between runs: the database is the state. A filing already
// held and indexed costs one row in a batched read and nothing else, so a second
// run over a finished corpus is minutes of MAYA reads and zero dollars.
//
// ⚠ THE DRY RUN STILL CALLS MAYA. It has to — the whole question it answers is
// "what would this cost", and only MAYA knows which filings exist. What it does
// not do is download a PDF, extract a page or embed a chunk.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { reindexDocument } from '../src/lib/corpus/reindex'
import type { CorpusDb } from '../src/lib/corpus/reindex'
import { listDisclosures } from '../src/lib/maya/disclosures'
import { toRemoteSources } from '../src/lib/maya/filings'
import { selectLatestOfEach, PRESENTATION_WINDOW_DAYS } from '../src/lib/maya/latestOfEach'
import { syncCompanyFilings, realSyncDeps, describeOutcome } from '../src/lib/maya/syncFilings'
import type { FilingSyncReport } from '../src/lib/maya/syncFilings'
import { ingestFiling } from '../src/lib/maya/ingestFiling'
import { describeFailure } from '../src/lib/maya/types'

// ── env ──────────────────────────────────────────────────────────────────────
// Loaded HERE rather than via `--env-file`, matching backfill-corpus.ts: a
// pre-bash hook blocks any shell command that names a .env file, because a secret
// that reaches a transcript is a secret that has leaked.

const HERE = dirname(fileURLToPath(import.meta.url))
for (const f of ['.env.local', '.env']) {
  const p = join(HERE, '..', f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

// ── args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const arg = (name: string) =>
  (argv.find((a) => a.startsWith(`--${name}=`)) ?? '').split('=').slice(1).join('=')
const LIMIT = Number(arg('limit') || '0')
const ONLY_COMPANY = arg('company')
/** The instant the 12-month presentation window is measured back from. Taken ONCE
 *  so every company in one run is selected against the same clock — a run that
 *  crosses midnight must not use two different windows. */
const NOW = new Date().toISOString()

const log = (...a: unknown[]) => console.log(...a)
const say = (s: string) => log(`${DRY ? '[dry] ' : ''}${s}`)

/**
 * $0.15 per million input tokens (gemini-embedding-001), and the measured Hebrew
 * calibration this repo already uses: 2.1 characters per token.
 *
 * A PRICE, NOT A BILL. It is an estimate from page counts, printed so the founder
 * sees the order of magnitude before the real run — the authoritative figure is
 * the provider's console, and this must never be quoted as one.
 */
const USD_PER_MILLION_EMBED_TOKENS = 0.15
const CHARS_PER_TOKEN_HE = 2.1
/** Measured over the existing corpus: 26 documents, 2,549 pages → ~2,050 chars/page. */
const CHARS_PER_PAGE = 2050
const estimateUsd = (pages: number) =>
  ((pages * CHARS_PER_PAGE) / CHARS_PER_TOKEN_HE / 1_000_000) * USD_PER_MILLION_EMBED_TOKENS

// ── db ───────────────────────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
if (!process.env.MAYA_API_KEY) throw new Error('MAYA_API_KEY required — this run is entirely MAYA reads')
const raw = createClient(url, serviceKey, { auth: { persistSession: false } })
const db = raw as unknown as CorpusDb

type CompanyRow = { id: string; name: string; tase_issuer_id: string | null }

async function loadCompanies(): Promise<CompanyRow[]> {
  const { data, error } = await raw.from('companies').select('id, name, tase_issuer_id').order('name')
  if (error) throw new Error(`loading companies failed: ${error.message}`)
  return ((data as CompanyRow[] | null) ?? []).filter((c) => c.tase_issuer_id)
}

/**
 * How far back to ask MAYA.
 *
 * TWO YEARS, and the reason is the annual report. `yearWindows` already adds the
 * late-filing +1 (a 2025 annual is published in March 2026), but a company that
 * has not yet filed its 2025 annual has its most recent one from 2024 — published
 * in 2025. One year back would find no annual for that company and the run would
 * report, with total confidence, that it has none.
 */
function yearSpan(): { from: number; to: number } {
  const year = new Date(NOW).getUTCFullYear()
  return { from: year - 2, to: year }
}

async function backfillCompany(company: CompanyRow): Promise<FilingSyncReport | null> {
  const span = yearSpan()
  const res = await listDisclosures({
    issuerId: Number(company.tase_issuer_id),
    fromYear: span.from,
    toYear: span.to,
  })
  if (!res.ok) {
    // A FAILED CATALOG IS NOT AN EMPTY ONE. Returning null rather than an empty
    // report keeps this company out of every total below — a coverage failure
    // counted as "0 filings selected" is the exact lie the disclosures layer's
    // own header refuses to produce one level up.
    log(`  ✗ MAYA failed — ${describeFailure(res.failure)} · left untouched, not recorded as empty`)
    return null
  }

  const catalog = toRemoteSources(res.data)
  const selected = selectLatestOfEach(catalog, { now: NOW })
  log(
    `  catalog ${catalog.length} → selected ${selected.length}` +
      ` (${selected.map((s) => s.kind[0].toUpperCase()).join('') || '—'})`
  )
  if (!selected.length) return null

  const report = await syncCompanyFilings(
    realSyncDeps({
      db,
      companyId: company.id,
      supabaseUrl: url!,
      serviceRoleKey: serviceKey!,
      ingestFiling,
      reindexDocument,
    }),
    { companyId: company.id, sources: selected, dryRun: DRY }
  )
  for (const o of report.outcomes) log(`    ${describeOutcome(o)}`)
  return report
}

async function main() {
  const all = await loadCompanies()
  const chosen = all
    .filter((c) => !ONLY_COMPANY || c.name.includes(ONLY_COMPANY))
    .slice(0, LIMIT > 0 ? LIMIT : undefined)

  const span = yearSpan()
  log(
    `MAYA backfill — "latest of each" · ${chosen.length} of ${all.length} companies with a TASE issuer id` +
      `${DRY ? '  [DRY RUN — MAYA reads only, no download, no extraction, no embedding]' : ''}`
  )
  log(
    `  depth: latest quarterly + latest annual + presentations of the last ${PRESENTATION_WINDOW_DAYS} days` +
      ` · catalog ${span.from}–${span.to} · window measured from ${NOW}`
  )
  if (ONLY_COMPANY) log(`  filtered to names containing "${ONLY_COMPANY}"`)

  const reports: FilingSyncReport[] = []
  let unreachable = 0
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i]
    log(`\n[${i + 1}/${chosen.length}] ${c.name} (issuer ${c.tase_issuer_id})`)
    try {
      const report = await backfillCompany(c)
      if (report) reports.push(report)
      else unreachable++
    } catch (e) {
      // A company that throws must not end the pass. It is counted, named, and
      // the next one starts — a re-run picks it up because the database is the
      // only state there is.
      unreachable++
      log(`  ✗ ${c.name} threw — ${(e as Error).message}`)
    }
  }

  const sum = (f: (r: FilingSyncReport) => number) => reports.reduce((n, r) => n + f(r), 0)
  const ingested = sum((r) => r.ingested)
  const pages = sum((r) => r.pages)
  const displaced = sum((r) => r.displaced)

  log('\n── this run ─────────────────────────────────────────────────────')
  say(`${ingested} document(s) ${DRY ? 'would be' : ''} ingested across ${reports.length} companies`)
  log(`  re-indexed (held, chunks missing): ${sum((r) => r.reindexed)}`)
  const unindexed = sum((r) => r.unindexed)
  // SAID LOUDLY, because this is the number the first A5 run did not print: 816 of
  // 832 documents ingested with no embeddings when the API ran out of credits, and
  // the summary read "failed: 0". A document Atlas holds but cannot search is not a
  // document the corpus has.
  log(`  INGESTED BUT NOT SEARCHABLE:      ${unindexed}${unindexed ? "  ← re-run once the cause is cleared; no re-download" : ""}`)
  log(`  failed:                            ${sum((r) => r.failed)}`)
  log(`  companies with no usable catalog:  ${unreachable}`)
  log(
    `  DISPLACED (a second filing on one (period, type) row): ${displaced}` +
      (displaced ? '  ← see docs/evidence/, this is the constraint 012 imposes' : '')
  )
  if (DRY) {
    log(
      `\n  NOTE: a dry run cannot know page counts without downloading, so it cannot price the run.` +
        `\n  Ask for the price after a real --limit run, where pages are measured rather than assumed.`
    )
  } else {
    log(
      `  pages ingested: ${pages}  ·  embeddings ≈ $${estimateUsd(pages).toFixed(2)} (ESTIMATE, not a bill)`
    )
  }

  // THE CLOSING COUNTS COME FROM THE DATABASE, never from adding up what this run
  // believed it did (M1: a count restated rather than regenerated has been wrong
  // every time in this repo).
  const { count: chunks } = await raw.from('document_chunks').select('id', { count: 'exact', head: true })
  const { count: docs } = await raw.from('company_documents').select('id', { count: 'exact', head: true })
  const { count: indexed } = await raw
    .from('company_documents')
    .select('id', { count: 'exact', head: true })
    .eq('index_status', 'indexed')
  log('\n── the corpus, as the database reports it ───────────────────────')
  log(`  company_documents: ${docs ?? '?'}  (indexed: ${indexed ?? '?'})`)
  log(`  document_chunks:   ${chunks ?? '?'}`)
}

main().catch((e) => {
  console.error('\nBACKFILL FAILED:', e)
  process.exit(1)
})
