// CLI: npx tsx scripts/sync-maya-calendar.ts [--years 2025,2026] [--dry-run]
//
// Turns MAYA's financial-report schedule into Atlas's calendar.
//
// TWO PHASES, both pure code — no model call anywhere. Everything the calendar
// needs (company, period, date, time, timezone) arrives STRUCTURED from
// `financial-report-schedule/by-report-year`. That is why this file does not
// open a single announcement attachment: measured 2026-08-09, 86 of 86 upcoming
// conference calls carry their time in the API response itself.
//
//   1. COMPANIES — every issuer in `maya_issuers` gets a `companies` row, so the
//      calendar can print a name. The schedule feed carries `issuerId` and
//      nothing else, so without this phase every event reads "1460 reports on
//      12 August". Run `maya-refresh-issuers.ts` first to populate/refresh the
//      directory (add --sweep for the companies that never schedule a call).
//
//   2. SCHEDULE — the rows themselves, deduped, into `scheduled_calls`.
//
// RE-RUNNABLE. Phase 2 upserts on `scheduled_calls_maya_key`
// (company_id, maya_year, maya_period_type_id, maya_report_type_id), added by
// migration 021 — before it, the table had no unique constraint at all and a
// second run would have duplicated every row.
//
// IT NEVER OVERWRITES A CURATED COMPANY. Four of the five pre-existing rows
// carry hand-written sector/description/website/logo_url, and MAYA has none of
// those fields — an upsert touching them would replace good data with nulls.
// Phase 1 therefore INSERTS unseen issuers only, and links (never rewrites)
// where a name already matches.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { mayaGet } from '../src/lib/maya/client'
import { PATH_SCHEDULE_BY_YEAR, MAYA_MIN_REQUEST_GAP_MS } from '../src/lib/maya/config'
import { normaliseCompanyName } from '../src/lib/maya/issuers'
import { toScheduleEvent, dedupeSchedule, type ScheduleEvent } from '../src/lib/maya/schedule'
import { describeFailure, type MayaEnvelope, type MayaScheduleRow } from '../src/lib/maya/types'

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
const DRY = process.argv.includes('--dry-run')

function yearsArg(): number[] {
  const i = process.argv.indexOf('--years')
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1]!.split(',').map(Number).filter(Number.isFinite)
  }
  // Verified 2026-08-09: only 2025 and 2026 return rows. 2020-2024 and 2027 are
  // all empty, so a wider default would spend requests to learn nothing.
  const y = new Date().getFullYear()
  return [y - 1, y]
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, key)
  if (DRY) console.log('DRY RUN — nothing will be written\n')

  // ── phase 1: a company row for every known issuer ──────────────────────────
  const { data: directory, error: dErr } = await db.from('maya_issuers').select('issuer_id, name_he, name_en')
  if (dErr) throw new Error(`maya_issuers read failed: ${dErr.message}`)
  if (!directory?.length) {
    throw new Error('maya_issuers is empty — run scripts/maya-refresh-issuers.ts first')
  }

  const { data: existing, error: cErr } = await db
    .from('companies')
    .select('id, name, name_en, display_name, tase_issuer_id')
  if (cErr) throw new Error(`companies read failed: ${cErr.message}`)

  const byIssuer = new Map<string, string>() // tase_issuer_id -> company uuid
  for (const c of existing ?? []) if (c.tase_issuer_id) byIssuer.set(String(c.tase_issuer_id), c.id)

  // Name index for the duplicate guard. `תמיס` sits in `companies` with a NULL
  // issuer id, so a blind insert would create a SECOND row for a company we
  // already have. Matching on the normalised name links it instead.
  const byName = new Map<string, { id: string; hasIssuer: boolean }>()
  for (const c of existing ?? []) {
    for (const n of [c.name, c.name_en, c.display_name]) {
      if (typeof n === 'string' && n.trim()) {
        byName.set(normaliseCompanyName(n), { id: c.id, hasIssuer: !!c.tase_issuer_id })
      }
    }
  }

  const toInsert: { name: string; display_name: string; tase_issuer_id: string }[] = []
  const toLink: { id: string; issuerId: string }[] = []

  for (const row of directory) {
    const issuerId = String(row.issuer_id)
    const name = (row.name_he ?? row.name_en ?? '').trim()
    if (!name) continue // an issuer with no name cannot be shown; skip rather than invent one
    if (byIssuer.has(issuerId)) continue

    const match = byName.get(normaliseCompanyName(name))
    if (match && !match.hasIssuer) toLink.push({ id: match.id, issuerId })
    else if (!match) toInsert.push({ name, display_name: name, tase_issuer_id: issuerId })
  }

  console.log(
    `PHASE 1 companies: ${directory.length} issuers in the directory · ${byIssuer.size} already linked · ` +
      `${toLink.length} to link by name · ${toInsert.length} to insert`
  )

  if (!DRY) {
    for (const l of toLink) {
      const { error } = await db.from('companies').update({ tase_issuer_id: l.issuerId }).eq('id', l.id)
      if (error) throw new Error(`link ${l.issuerId} failed: ${error.message}`)
      byIssuer.set(l.issuerId, l.id)
    }
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200)
      const { data, error } = await db.from('companies').insert(chunk).select('id, tase_issuer_id')
      if (error) throw new Error(`companies insert failed: ${error.message}`)
      for (const c of data ?? []) if (c.tase_issuer_id) byIssuer.set(String(c.tase_issuer_id), c.id)
    }
    console.log(`  inserted ${toInsert.length}, linked ${toLink.length}`)
  } else {
    // A DRY RUN MUST PREDICT THE REAL RUN, not report the consequences of not
    // having run. Without this the mapping count below collapses to the handful
    // of pre-existing companies and prints "issuer not in the directory" about
    // 875 issuers that ARE in it — a diagnostic that names the wrong cause is
    // worse than none, because it sends the next person to re-run the refresh.
    for (const l of toLink) byIssuer.set(l.issuerId, `dry:${l.issuerId}`)
    for (const c of toInsert) byIssuer.set(c.tase_issuer_id, `dry:${c.tase_issuer_id}`)
  }

  // ── phase 2: the schedule ─────────────────────────────────────────────────
  const years = yearsArg()
  const raw: MayaScheduleRow[] = []
  for (const year of years) {
    const res = await mayaGet<MayaEnvelope<MayaScheduleRow>>(PATH_SCHEDULE_BY_YEAR, { Year: year })
    if (!res.ok) {
      // A REACHABILITY FAILURE IS NOT AN EMPTY YEAR. Saying so and stopping is
      // the difference between "MAYA is down" and "nobody reports in 2026",
      // which would otherwise look identical in the database.
      throw new Error(`schedule ${year}: ${describeFailure(res.failure)}`)
    }
    const rows = res.data.data ?? []
    raw.push(...rows)
    console.log(`PHASE 2 schedule ${year}: ${rows.length} rows`)
    await sleep(MAYA_MIN_REQUEST_GAP_MS)
  }
  if (raw.length === 0) throw new Error('the schedule feed returned nothing at all — refusing to proceed')

  const parsed: ScheduleEvent[] = []
  let unparseable = 0
  for (const r of raw) {
    const e = toScheduleEvent(r)
    if (e) parsed.push(e)
    else unparseable++
  }

  const { kept, superseded } = dedupeSchedule(parsed)
  // NO SILENT TRUNCATION. Every row that does not become a calendar entry is
  // counted out loud, because a partial import otherwise reads as complete.
  console.log(
    `  parsed ${parsed.length}/${raw.length} (${unparseable} unusable) · ` +
      `${kept.length} kept · ${superseded.length} superseded by a later date`
  )
  for (const s of superseded.slice(0, 10)) {
    console.log(`    superseded: issuer ${s.issuerId} ${s.quarter} ${s.kind} @ ${s.scheduledAtUtc}`)
  }
  if (superseded.length > 10) console.log(`    ... and ${superseded.length - 10} more`)

  const rows = kept
    .map((e) => {
      const companyId = byIssuer.get(String(e.issuerId))
      if (!companyId) return null
      return {
        company_id: companyId,
        scheduled_at: e.scheduledAtUtc,
        quarter: e.quarter,
        status: 'scheduled',
        source: 'maya',
        kind: e.kind,
        time_known: e.timeKnown,
        maya_year: e.mayaYear,
        maya_period_type_id: e.mayaPeriodTypeId,
        maya_report_type_id: e.mayaReportTypeId,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const unknownIssuers = kept.length - rows.length
  console.log(
    `  ${rows.length} events map to a company · ${unknownIssuers} skipped (issuer not in the directory)`
  )
  if (unknownIssuers > 0) {
    // Say WHICH gap this is. After phase 1 every directory issuer has a company,
    // so anything still unmapped is an issuer that schedules reports and yet was
    // never named by `by-issuer` — i.e. the directory itself is short, not this run.
    const missing = Array.from(new Set(kept.map((e) => e.issuerId).filter((i) => !byIssuer.has(String(i)))))
    console.log(
      `    → these issuers appear in the schedule but not in maya_issuers: ${missing.slice(0, 12).join(', ')}` +
        `${missing.length > 12 ? `, +${missing.length - 12} more` : ''}\n` +
        `      Re-run scripts/maya-refresh-issuers.ts (they filed nothing in its name window).`
    )
  }

  if (DRY) {
    const withTime = rows.filter((r) => r.time_known).length
    console.log(
      `\nDRY RUN — would write ${rows.length} rows ` +
        `(${rows.filter((r) => r.kind === 'call').length} calls, ${rows.filter((r) => r.kind === 'report').length} reports; ` +
        `${withTime} with a known time)`
    )
    return
  }

  let written = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await db.from('scheduled_calls').upsert(chunk, {
      onConflict: 'company_id,maya_year,maya_period_type_id,maya_report_type_id',
    })
    if (error) throw new Error(`scheduled_calls upsert failed: ${error.message}`)
    written += chunk.length
  }

  const now = new Date().toISOString()
  const upcoming = rows.filter((r) => r.scheduled_at > now)
  console.log(
    `\nDONE. ${written} schedule rows written.\n` +
      `  upcoming: ${upcoming.length} (${upcoming.filter((r) => r.kind === 'call').length} calls, ` +
      `${upcoming.filter((r) => r.kind === 'report').length} report dates)\n` +
      `  with a published time: ${rows.filter((r) => r.time_known).length} of ${rows.length}`
  )
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
