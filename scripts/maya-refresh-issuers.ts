// CLI: npx tsx scripts/maya-refresh-issuers.ts
//
// Builds the name -> issuer-number directory that lets a user type "תיגבור" and
// have Atlas ask MAYA about issuer 1460. Re-runnable; roughly 50 seconds.
//
// WHY THIS EXISTS AS A SCRIPT AND NOT A LOOKUP: MAYA publishes no "list all
// issuers" endpoint. The only route to a directory is the reporting schedule,
// which is keyed by issuerId, plus one `by-issuer` call per id to read the name.
// That is ~470 requests against a 10-per-2-seconds budget — fine once, absurd
// per user question.
//
// COVERAGE CAVEAT, PRINTED AT THE END BECAUSE IT MATTERS: this finds only
// companies that announced a reporting date. A listed company that never
// scheduled one will not be in here and will not resolve by name.
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, key)

  // ── 1. every issuer that has scheduled a report ───────────────────────────
  // The schedule feed carries no names, only ids. It goes back to 2025; asking
  // for 2024 returns zero rows, so there is no point looking further back.
  const ids = new Set<number>()
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

  // ── 2. a name for each ────────────────────────────────────────────────────
  // A 30-day window keeps each payload tiny; we only want `issuer[].issuerName`.
  // An issuer that filed nothing in that window yields no name, so the window
  // is deliberately recent-and-wide-ish rather than a single day.
  const from = `${thisYear - 1}-01-01`
  const to = `${thisYear - 1}-12-31`

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
    `\nDIRECTORY: ${withNames.length} issuers written (${ids.size} seen, ${ids.size - withNames.length} had no name in the window).`
  )
  console.log(`COMPANIES: ${backfilled} backfilled with a tase_issuer_id.`)
  console.log(
    `\nCOVERAGE CAVEAT: this directory is built from the reporting schedule, so it holds only\n` +
      `companies that ANNOUNCED a reporting date. A listed company that never scheduled one is\n` +
      `not in here and will not resolve by name.`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
