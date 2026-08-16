// THE CLOSED-PERIOD RULE'S BLAST RADIUS, ACROSS EVERY ISSUER ATLAS HOLDS.
//
//   node --import tsx scripts/measure-period-labels.ts
//
// COMMITTED BECAUSE THE COUNT IS CITED. `rules/app.md` says a count carries its
// command and must never be copied from prose; the numbers in
// `docs/evidence/feat-smart-layer-b3-workspace-chat/founder-bugs-2026-08-16.md`
// come from this file and can be re-derived by running it.
//
// It answers, with a number rather than an argument, the question a cold review
// raised as a BLOCKER: how many document-eligible filings LOSE their period label
// — and therefore their place on the documents tab — under the new rule that they
// held under the old one? The first version of the rule refused 99 filings
// including 18 real reports; the measured version refuses 81, all decks.
//
// Read-only: MAYA GETs plus pure functions. Touches no database, writes nothing.
// ~2 minutes for 233 issuers, paced under MAYA's 10 requests / 2 seconds.

import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'
import { listDisclosures } from '../src/lib/maya/disclosures'
import { toRemoteSources } from '../src/lib/maya/filings'
import { isDocumentEvent, docTypeFor, filingKind } from '../src/lib/maya/events'
import { israelDayKey, israelInstant } from '../src/lib/i18n/format'

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} })

/** The label logic EXACTLY as it stood before this branch (feed order, no checks). */
const OLD_PERIOD_BY_EVENT: Record<number, string> = { 101: 'FY', 104: 'Q1', 105: 'Q2', 106: 'Q3' }
function oldPeriodFor(eventIds: number[], title: string | null, publishedISO: string): string {
  const period = eventIds.map((id) => OLD_PERIOD_BY_EVENT[id]).find(Boolean) ?? ''
  let day = ''
  try {
    day = israelDayKey(israelInstant(publishedISO) ?? publishedISO)
  } catch {
    day = ''
  }
  const titleYear = title?.match(/\b(19|20)\d{2}\b/)?.[0]
  if (period) return `${period} ${titleYear ?? day.slice(0, 4)}`.trim()
  if (!day) return titleYear ?? ''
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
}

/** What `documentCatalog.parsePeriod` accepts — anything else has no place on the tab. */
const isPeriod = (s: string) => /^(FY|Q1|Q2|Q3) (?:19|20)\d{2}$/.test(s)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data, error } = await db
    .from('companies')
    .select('id, name, tase_issuer_id')
    .not('tase_issuer_id', 'is', null)
  if (error) throw error
  const companies = (data ?? []).filter((c) => Number(c.tase_issuer_id) > 0)
  console.log(`issuers: ${companies.length}`)

  let filings = 0
  let lost: { name: string; title: string; ids: number[]; old: string; now: string; kind: string }[] = []
  let gainedFromWrong = 0
  let unchanged = 0
  let failures = 0

  for (const [i, c] of companies.entries()) {
    const res = await listDisclosures({
      issuerId: Number(c.tase_issuer_id),
      fromYear: 2022,
      toYear: 2026,
    })
    if (!res.ok) {
      failures++
      continue
    }
    const now = toRemoteSources(res.data)
    const byId = new Map(now.map((s) => [s.mayaReportId, s]))

    for (const f of res.data) {
      const ids = (f.events ?? []).map((e) => e.eventId)
      if (!isDocumentEvent(ids) || !docTypeFor(ids) || !filingKind(ids)) continue
      const src = byId.get(f.mayaReportId)
      if (!src) continue // no PDF etc — same before and after
      filings++
      const before = oldPeriodFor(ids, f.title, f.publicationDate)
      const after = src.period
      if (before === after) {
        unchanged++
        continue
      }
      if (isPeriod(before) && !isPeriod(after)) {
        lost.push({
          name: c.name,
          title: f.title ?? '',
          ids,
          old: before,
          now: after,
          kind: filingKind(ids) ?? '',
        })
      } else {
        gainedFromWrong++
      }
    }
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${companies.length}`)
    await new Promise((r) => setTimeout(r, 260)) // under MAYA's 10 req / 2s
  }

  console.log(`\nissuer fetch failures: ${failures}`)
  console.log(`document-eligible filings measured: ${filings}`)
  console.log(`label unchanged: ${unchanged}`)
  console.log(`label changed but still a period (re-pointed, keeps its place): ${gainedFromWrong}`)
  console.log(`LOST ITS PLACE ON THE TAB: ${lost.length}`)
  const byKind: Record<string, number> = {}
  for (const l of lost) byKind[l.kind] = (byKind[l.kind] ?? 0) + 1
  console.log(`  by kind: ${JSON.stringify(byKind)}`)
  console.log('\n--- EVERY non-presentation loss (the ones that must be justified one by one) ---')
  for (const l of lost.filter((x) => x.kind !== 'presentation')) {
    console.log(`  - [${l.ids.join(',')}] ${l.kind.padEnd(10)} ${l.old} -> ${l.now}  ${l.name} :: ${l.title}`)
  }
}

main().catch((e) => {
  console.error('FAILED', e)
  process.exit(1)
})
