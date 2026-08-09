// CLI: npx tsx scripts/sync-maya-companies.ts [--dry-run] [--no-logos]
//
// Fills the company profile columns that have been sitting empty since the
// table was created: sector, sub_sector, description, website, logo_url.
//
// NO MIGRATION. All five columns already exist on `public.companies` and
// `lib/db/companies.ts` already reads them into the app — the company page has
// been rendering `sector · sub_sector` all along against nulls. This script
// only supplies the values.
//
// ONE REQUEST FOR THE WHOLE UNIVERSE. `company-details` with no `issuerId`
// returns all 1,630 TASE companies (~1.3 MB). That is a strict superset of what
// `maya-refresh-issuers.ts --sweep` spends ~2,600 requests and ~9 minutes
// discovering, which is why the sweep is retired rather than re-run.
//
// IT NEVER OVERWRITES A VALUE A HUMAN WROTE. Four companies carry hand-curated
// sector/description/website/logo_url from before MAYA existed here. The rule
// is per-FIELD, not per-row: an empty column is filled, a populated one is left
// alone and counted out loud. Whether MAYA should eventually win is a founder
// decision, and it cannot be made from data we have overwritten.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { mayaGet } from '../src/lib/maya/client'
import { PATH_COMPANY_DETAILS } from '../src/lib/maya/config'
import {
  toCompanyProfile,
  mayaLogoUrl,
  sniffImage,
  PLACEHOLDER_MIN_SHARERS,
  type CompanyProfile,
} from '../src/lib/maya/companyProfile'
import { describeFailure, type MayaCompanyDetailsResponse } from '../src/lib/maya/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const DRY = process.argv.includes('--dry-run')
const NO_LOGOS = process.argv.includes('--no-logos')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type CompanyRow = {
  id: string
  name: string
  tase_issuer_id: string | null
  sector: string | null
  sub_sector: string | null
  description: string | null
  website: string | null
  logo_url: string | null
}

const empty = (v: string | null) => v === null || v.trim() === ''

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, key)
  if (DRY) console.log('DRY RUN — nothing will be written\n')

  // ── 1. the feed ────────────────────────────────────────────────────────────
  const res = await mayaGet<MayaCompanyDetailsResponse>(PATH_COMPANY_DETAILS)
  if (!res.ok) {
    // AN UNREACHABLE MAYA IS NOT AN EMPTY UNIVERSE. Stopping here is the whole
    // difference between "the API is down" and "no company has a sector".
    throw new Error(`company-details: ${describeFailure(res.failure)}`)
  }
  const rows = res.data.getCompanyDetails?.result ?? []
  if (rows.length === 0) throw new Error('company-details returned no rows — refusing to proceed')

  const profiles = new Map<string, CompanyProfile>()
  let unusable = 0
  for (const r of rows) {
    const p = toCompanyProfile(r)
    if (p) profiles.set(String(p.issuerId), p)
    else unusable++
  }
  console.log(
    `FEED: ${rows.length} companies from MAYA · ${profiles.size} usable · ${unusable} without an issuer id`
  )

  // ── 2. our companies ───────────────────────────────────────────────────────
  const { data: companies, error } = await db
    .from('companies')
    .select('id, name, tase_issuer_id, sector, sub_sector, description, website, logo_url')
  if (error) throw new Error(`companies read failed: ${error.message}`)

  const linked = (companies as CompanyRow[]).filter((c) => c.tase_issuer_id)
  const unlinked = (companies as CompanyRow[]).length - linked.length
  const matched = linked.filter((c) => profiles.has(String(c.tase_issuer_id)))
  console.log(
    `OURS: ${companies!.length} rows · ${linked.length} carry an issuer id · ` +
      `${matched.length} matched in the feed · ${linked.length - matched.length} not in it` +
      (unlinked ? ` · ${unlinked} have no issuer id at all` : '')
  )

  // ── 3. logos ───────────────────────────────────────────────────────────────
  // Fetched BEFORE any write so a placeholder can be recognised by how many
  // companies share it — a judgement that cannot be made one row at a time.
  const logoFor = new Map<string, string>()
  let placeholderCount = 0
  let notAnImage = 0
  let logoMissing = 0

  if (!NO_LOGOS) {
    const byHash = new Map<string, string[]>() // sha1 -> company ids
    console.log(`\nLOGOS: fetching ${matched.length} …`)
    for (let i = 0; i < matched.length; i++) {
      const c = matched[i]!
      try {
        const r = await fetch(mayaLogoUrl(c.tase_issuer_id!))
        if (!r.ok) {
          logoMissing++
        } else {
          const bytes = new Uint8Array(await r.arrayBuffer())
          if (!sniffImage(bytes)) {
            // A 200 that is not an image: a WAF page, an error blob, anything.
            notAnImage++
          } else {
            const h = createHash('sha1').update(bytes).digest('hex')
            const list = byHash.get(h) ?? []
            list.push(c.id)
            byHash.set(h, list)
          }
        }
      } catch {
        logoMissing++
      }
      if ((i + 1) % 60 === 0) console.log(`  ${i + 1}/${matched.length} …`)
      await sleep(70)
    }

    const byId = new Map(matched.map((c) => [c.id, c]))
    for (const [, ids] of byHash) {
      if (ids.length >= PLACEHOLDER_MIN_SHARERS) {
        // NOT a logo — a template. Left null so the page draws its monogram.
        placeholderCount += ids.length
        continue
      }
      for (const id of ids) {
        const c = byId.get(id)!
        logoFor.set(id, mayaLogoUrl(c.tase_issuer_id!))
      }
    }
    const shared = Array.from(byHash.values()).filter(
      (ids) => ids.length > 1 && ids.length < PLACEHOLDER_MIN_SHARERS
    )
    console.log(
      `  ${logoFor.size} real · ${placeholderCount} generic placeholder (>= ${PLACEHOLDER_MIN_SHARERS} companies share one image) · ` +
        `${notAnImage} served a 200 that was not an image · ${logoMissing} unreachable`
    )
    if (shared.length) {
      console.log(
        `  note: ${shared.length} image(s) shared by exactly 2 companies — kept, since a parent and a subsidiary may file under one mark`
      )
    }
  } else {
    console.log('\nLOGOS: skipped (--no-logos)')
  }

  // ── 4. the writes ──────────────────────────────────────────────────────────
  const FIELDS = ['sector', 'sub_sector', 'description', 'website', 'logo_url'] as const
  const filled: Record<string, number> = Object.fromEntries(FIELDS.map((f) => [f, 0]))
  const kept: Record<string, number> = Object.fromEntries(FIELDS.map((f) => [f, 0]))
  let touched = 0

  for (const c of matched) {
    const p = profiles.get(String(c.tase_issuer_id))!
    const patch: Record<string, string> = {}
    const want: Record<(typeof FIELDS)[number], string | null> = {
      sector: p.sector,
      sub_sector: p.subSector,
      description: p.description,
      website: p.website,
      logo_url: logoFor.get(c.id) ?? null,
    }

    for (const f of FIELDS) {
      const current = c[f]
      const next = want[f]
      if (next === null) continue // nothing to offer
      if (!empty(current)) {
        kept[f]!++ // a human wrote this; leave it
        continue
      }
      patch[f] = next
      filled[f]!++
    }

    if (Object.keys(patch).length === 0) continue
    touched++
    if (!DRY) {
      const { error: uErr } = await db.from('companies').update(patch).eq('id', c.id)
      if (uErr) throw new Error(`update ${c.name} failed: ${uErr.message}`)
    }
  }

  console.log(`\n${DRY ? 'WOULD WRITE' : 'WROTE'}: ${touched} companies touched`)
  for (const f of FIELDS) {
    console.log(
      `  ${f.padEnd(12)} filled ${String(filled[f]).padStart(4)}   left alone (already set) ${kept[f]}`
    )
  }
  if (matched.length < linked.length) {
    const missing = linked
      .filter((c) => !profiles.has(String(c.tase_issuer_id)))
      .map((c) => `${c.name} (${c.tase_issuer_id})`)
    console.log(
      `\n${missing.length} of our companies are not in the MAYA feed: ${missing.slice(0, 10).join(' · ')}` +
        `${missing.length > 10 ? ` · +${missing.length - 10} more` : ''}`
    )
  }
}

main().catch((e) => {
  console.error(`\nFAILED: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
