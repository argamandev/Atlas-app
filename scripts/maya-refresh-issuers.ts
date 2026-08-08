// CLI: npx tsx scripts/maya-refresh-issuers.ts [--sweep] [--from N] [--to N]
//
// Builds the name -> issuer-number directory that lets a user type "תיגבור" and
// have Atlas ask MAYA about issuer 1460. Re-runnable.
//
// WHY THIS EXISTS AS A SCRIPT AND NOT A LOOKUP: MAYA publishes no "list all
// issuers" endpoint. The only route to a directory is one `by-issuer` call per
// id — fine once, absurd per user question.
//
// TWO MODES, because the founder's company universe has two tiers
// (decision 2026-08-08):
//
//   default   ids come from the reporting schedule. ~230 issuers, ~1 minute.
//             These are the companies that HOLD investor calls — tier 1, and
//             everything the calendar needs.
//
//   --sweep   walk the issuer-id space directly. Measured 2026-08-09 by
//             sampling 240 ids across 16 bands: issuers live in roughly
//             200-2,600, with ZERO hits at ids 1-15, 3000, 5000, 10000 and
//             50000. ~2,600 requests, ~9 minutes, and it finds the companies
//             that file reports but never schedule a call — tier 2, which the
//             company pages need. Run monthly; the calendar does not need it.
//
// THE SWEEP'S UPPER BOUND IS MEASURED, NOT GUARANTEED. Density was still 80% at
// id 2500 and 0% at 3000, so the boundary sits somewhere between. The run prints
// the highest id it actually found and SHOUTS if that equals `--to`, because
// that means the universe may continue past where we stopped looking.
//
// COVERAGE CAVEAT, PRINTED AT THE END BECAUSE IT MATTERS: in default mode this
// finds only companies that announced a reporting date. A listed company that
// never scheduled one will not be in here and will not resolve by name.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { mayaGet } from '../src/lib/maya/client'
import {
  PATH_DISCLOSURES_BY_ISSUER,
  PATH_SCHEDULE_BY_YEAR,
  MAYA_MIN_REQUEST_GAP_MS,
} from '../src/lib/maya/config'
import { normaliseCompanyName } from '../src/lib/maya/issuers'
import type { MayaEnvelope, MayaFiling, MayaScheduleRow } from '../src/lib/maya/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const thisYear = new Date().getFullYear()

const flag = (name: string) => process.argv.includes(`--${name}`)
function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) ? v : fallback
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, key)

  // ── 1. which issuer ids to ask about ──────────────────────────────────────
  const sweep = flag('sweep')
  const sweepFrom = numArg('from', 1)
  const sweepTo = numArg('to', 2600)
  const ids = new Set<number>()

  if (sweep) {
    // Tier 2: probe the id space itself. Phase 2 below already does one
    // `by-issuer` call per id and reads the name out of it, so an id that
    // returns filings IS a discovered issuer — no separate existence check.
    for (let i = sweepFrom; i <= sweepTo; i++) ids.add(i)
    console.log(
      `  sweep mode: probing ids ${sweepFrom}-${sweepTo} (${ids.size} requests, ~${Math.round((ids.size * MAYA_MIN_REQUEST_GAP_MS) / 60000)} min)`
    )
  } else {
    // Tier 1: the schedule feed carries no names, only ids. It holds 2025 and
    // 2026 only — asking for 2024 or 2027 returns zero rows (verified
    // 2026-08-09), so there is no point looking further out in either direction.
    for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
      const res = await mayaGet<MayaEnvelope<MayaScheduleRow>>(PATH_SCHEDULE_BY_YEAR, { year })
      if (!res.ok) {
        console.error(`  schedule ${year}: FAILED (${res.failure.kind}) — skipping this year`)
        continue
      }
      for (const row of res.data.data ?? []) if (row.issuerId) ids.add(row.issuerId)
      console.log(
        `  schedule ${year}: ${(res.data.data ?? []).length} rows, ${ids.size} distinct issuers so far`
      )
      await sleep(MAYA_MIN_REQUEST_GAP_MS)
    }
    if (ids.size === 0) throw new Error('no issuers found — refusing to write an empty directory')
  }

  // ── 2. a name for each ────────────────────────────────────────────────────
  // We only want `issuer[].issuerName`, but an issuer that filed nothing in the
  // window yields no name at all — so the window decides who is discoverable.
  //
  // A ROLLING 12 MONTHS, not a fixed past year (changed 2026-08-09). The old
  // window was all of LAST year, which cannot see a company that listed this
  // year: it would file steadily and still be invisible to the directory. A
  // rolling year answers "who is filing now", which is the question a company
  // directory is actually asking. 365 days is also the API's own maximum range.
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 364 * 24 * 3600 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const from = iso(yearAgo)
  const to = iso(today)

  const rows: { issuer_id: number; name_he: string | null; name_en: string | null }[] = []
  let named = 0
  let n = 0
  for (const issuerId of Array.from(ids)) {
    n++
    const res = await mayaGet<MayaEnvelope<MayaFiling>>(PATH_DISCLOSURES_BY_ISSUER, {
      IssuerId: issuerId,
      FromDate: from,
      ToDate: to,
    })
    await sleep(MAYA_MIN_REQUEST_GAP_MS)

    if (!res.ok) {
      console.error(`  [${n}/${ids.size}] ${issuerId}: ${res.failure.kind}`)
      continue
    }
    const name =
      (res.data.data ?? []).flatMap((f) => f.issuer ?? []).find((i) => i.issuerId === issuerId)?.issuerName ??
      null

    if (name) named++
    rows.push({ issuer_id: issuerId, name_he: name, name_en: null })
    if (n % 25 === 0) console.log(`  [${n}/${ids.size}] named ${named}`)
  }

  // ── 3. write the directory ────────────────────────────────────────────────
  // Only rows that actually carry a name: an id with no name cannot be resolved
  // from a sentence, so storing it would add nothing but noise.
  const withNames = rows.filter((r) => r.name_he)
  for (let i = 0; i < withNames.length; i += 100) {
    const chunk = withNames.slice(i, i + 100).map((r) => ({ ...r, updated_at: new Date().toISOString() }))
    const { error } = await db.from('maya_issuers').upsert(chunk, { onConflict: 'issuer_id' })
    if (error) throw new Error(`maya_issuers upsert failed: ${error.message}`)
  }

  // ── 4. backfill companies.tase_issuer_id ──────────────────────────────────
  // All four existing companies have this column NULL, so without this nothing
  // in Atlas can address a company it already holds to the MAYA API.
  const { data: companies, error: cErr } = await db
    .from('companies')
    .select('id, name, name_en, display_name, tase_issuer_id')
  if (cErr) throw new Error(cErr.message)

  let backfilled = 0
  for (const c of companies ?? []) {
    if (c.tase_issuer_id) continue
    const names = [c.name, c.name_en, c.display_name]
      .filter((v): v is string => typeof v === 'string' && !!v)
      .map(normaliseCompanyName)
    const hit = withNames.find((r) => {
      const rn = normaliseCompanyName(r.name_he as string)
      return names.some((n2) => n2 === rn || n2.includes(rn) || rn.includes(n2))
    })
    if (!hit) continue
    const { error } = await db
      .from('companies')
      .update({ tase_issuer_id: String(hit.issuer_id) })
      .eq('id', c.id)
    if (error) throw new Error(error.message)
    backfilled++
    console.log(`  backfilled ${c.name} -> issuer ${hit.issuer_id}`)
  }

  console.log(
    `\nDIRECTORY: ${withNames.length} issuers written (${ids.size} ids probed, ${ids.size - withNames.length} returned no name in ${from}..${to}).`
  )
  console.log(`COMPANIES: ${backfilled} backfilled with a tase_issuer_id.`)

  if (sweep) {
    // THE BOUND IS MEASURED, NOT GUARANTEED — say so out loud rather than
    // letting a truncated universe read as a complete one.
    const highest = withNames.reduce((max, r) => Math.max(max, r.issuer_id), 0)
    console.log(`SWEEP: highest issuer found = ${highest} (searched to ${sweepTo}).`)
    if (highest >= sweepTo) {
      console.log(
        `\n⚠  THE HIGHEST ISSUER FOUND IS AT THE EDGE OF THE SEARCH. There are very likely\n` +
          `   more above ${sweepTo}. Re-run with --to ${sweepTo + 1000} before treating this\n` +
          `   directory as the whole universe.`
      )
    }
  } else {
    console.log(
      `\nCOVERAGE CAVEAT: this directory is built from the reporting schedule, so it holds only\n` +
        `companies that ANNOUNCED a reporting date. A listed company that never scheduled one is\n` +
        `not in here and will not resolve by name. Run with --sweep to find those too.`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
