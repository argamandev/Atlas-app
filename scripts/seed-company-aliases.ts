// CLI: npx tsx scripts/seed-company-aliases.ts [--dry-run]
//
// Seeds `company_aliases` from the live `companies` table plus the curated
// abbreviation list (smart-layer slice A2). The derivation itself lives in
// `src/lib/company/aliasSeed.ts`, where the battery proves offline that what
// this script writes makes resolveCompany('בז"א') land on בית זיקוק אשדוד.
//
// ADDITIVE AND RE-RUNNABLE: inserts ignore rows whose alias already exists
// (UNIQUE(alias)), so a re-run after new companies appear only adds. It never
// updates or deletes — repointing an existing alias is a founder decision made
// by hand, not a side effect of a sweep.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildAliasSeed, type CompanySeedSource } from '../src/lib/company/aliasSeed'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url, key, { auth: { persistSession: false } })
  const dryRun = process.argv.includes('--dry-run')

  const companies = await db
    .from('companies')
    .select('id, name, display_name, name_en, tase_security_id, tase_issuer_id')
  if (companies.error) throw new Error(`companies read failed: ${companies.error.message}`)

  const sources: CompanySeedSource[] = (companies.data ?? []).map((c) => ({
    id: String(c.id),
    name: (c.name as string) ?? null,
    displayName: (c.display_name as string) ?? null,
    nameEn: (c.name_en as string) ?? null,
    taseSecurityId: (c.tase_security_id as string) ?? null,
    taseIssuerId: (c.tase_issuer_id as string) ?? null,
  }))

  const { rows, collisions, unmatchedCurated } = buildAliasSeed(sources)

  const perKind = new Map<string, number>()
  for (const r of rows) perKind.set(r.kind, (perKind.get(r.kind) ?? 0) + 1)
  console.log(`companies: ${sources.length}`)
  console.log(`derived aliases: ${rows.length}`)
  perKind.forEach((n, kind) => console.log(`  ${kind}: ${n}`))

  // Collisions are DECISIONS, not noise — print every one for the founder.
  if (collisions.length > 0) {
    console.log(`\nSKIPPED — ${collisions.length} alias(es) two companies would share (nobody got them):`)
    for (const c of collisions) console.log(`  «${c.alias}» → companies ${c.companyIds.join(', ')}`)
  }
  if (unmatchedCurated.length > 0) {
    console.log(`\nUNMATCHED curated aliases (issuer id not in companies): ${unmatchedCurated.join(', ')}`)
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  // UNIQUE(alias) + ignoreDuplicates makes this idempotent: existing rows are
  // left exactly as they are, even if this run derived a different mapping.
  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) => ({
      company_id: r.companyId,
      alias: r.alias,
      kind: r.kind,
    }))
    const res = await db
      .from('company_aliases')
      .upsert(batch, { onConflict: 'alias', ignoreDuplicates: true })
      .select('id')
    if (res.error) throw new Error(`insert failed at batch ${i / CHUNK}: ${res.error.message}`)
    inserted += (res.data ?? []).length
  }

  const total = await db.from('company_aliases').select('id', { count: 'exact', head: true })
  if (total.error) throw new Error(`count failed: ${total.error.message}`)
  console.log(`\ninserted this run: ${inserted}`)
  console.log(`company_aliases now holds: ${total.count} rows`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
