// CLI: npx tsx scripts/ingest-document.ts --file <pdf> --company <uuid|ticker> \
//        --quarter "Q2 2026" [--type report] [--title "..."]
// Env from .env.local (same tiny loader pattern as scripts/transcribe-batch.mjs).
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ingestDocument } from '../src/lib/documents/ingest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const file = arg('file')
const company = arg('company')
const quarter = arg('quarter')
const docType = (arg('type') ?? 'report') as 'report' | 'slides'
if (docType !== 'report' && docType !== 'slides') {
  console.error(`--type must be 'report' or 'slides' (got '${docType}')`)
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!file || !company || !quarter) {
    console.error(
      'Usage: npx tsx scripts/ingest-document.ts --file <pdf> --company <uuid|ticker> --quarter "Q2 2026" [--type report|slides] [--title ...]'
    )
    process.exit(1)
  }
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`)
    process.exit(1)
  }
  const db = createClient(url, key)
  // resolve company: uuid passes through, anything else is looked up as a TASE security id
  // (the companies table has no 'ticker' column — tase_security_id is the ticker-like key)
  let companyId = company
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company)) {
    const { data } = await db
      .from('companies')
      .select('id, name')
      .eq('tase_security_id', company)
      .maybeSingle()
    if (!data) {
      console.error(`No company with ticker ${company}`)
      process.exit(1)
    }
    companyId = data.id as string
    console.log(`company: ${data.name} (${companyId})`)
  }
  const title = arg('title') ?? `${docType === 'report' ? 'דוח רבעוני' : 'מצגת'} ${quarter}`
  const res = await ingestDocument({
    supabaseUrl: url,
    serviceRoleKey: key,
    fileBytes: new Uint8Array(readFileSync(file)),
    companyId,
    quarter,
    docType,
    title,
  })
  console.log(`INGESTED document ${res.documentId} — ${res.pageCount} pages`)
}

main().catch((err) => {
  console.error('INGEST FAILED:', err.message)
  process.exit(1)
})
