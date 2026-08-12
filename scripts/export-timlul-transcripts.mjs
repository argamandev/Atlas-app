// CLI: node scripts/export-timlul-transcripts.mjs --out <dir>
// Ticket 04 (smart-layer map): export the Timlul-era unattributed transcripts
// (company_id IS NULL) to cold storage before they are deleted from the shared DB.
// Writes one JSON file per row plus manifest.json, then re-reads every file and
// verifies it parses and matches the row's id — the export is the only copy that
// will exist after the delete, so it verifies itself (M1: say what the evidence
// measured — here, bytes on disk, re-read and parsed, not "the write reported ok").
// Env from .env.local (same tiny loader pattern as scripts/ingest-document.ts).
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const outArgAt = process.argv.indexOf('--out')
const outDir = outArgAt >= 0 ? process.argv[outArgAt + 1] : undefined
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!outDir) {
    console.error('Usage: node scripts/export-timlul-transcripts.mjs --out <dir>')
    process.exit(1)
  }
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await db.from('transcripts').select('*').is('company_id', null)
  if (error) {
    console.error('Fetch failed:', error.message)
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })

  // id is TEXT and appears in filenames — sanitize, and fail on collision rather than overwrite.
  const seen = new Set()
  const manifest = []
  for (const row of data) {
    const safe = String(row.id).replace(/[^A-Za-z0-9._-]/g, '_')
    if (seen.has(safe)) {
      console.error(`Filename collision after sanitizing id "${row.id}" — aborting, nothing deleted.`)
      process.exit(1)
    }
    seen.add(safe)
    const file = join(outDir, `${safe}.json`)
    const body = JSON.stringify(row, null, 2)
    writeFileSync(file, body, 'utf8')
    manifest.push({
      id: row.id,
      file: `${safe}.json`,
      youtube_title: row.youtube_title,
      status: row.status,
      created_at: row.created_at,
      user_id: row.user_id,
      bytes: Buffer.byteLength(body),
    })
  }

  // Verify: every file re-reads, parses, and carries the id the manifest says it does.
  let verified = 0
  for (const entry of manifest) {
    const back = JSON.parse(readFileSync(join(outDir, entry.file), 'utf8'))
    if (back.id !== entry.id) {
      console.error(`Verification failed: ${entry.file} contains id ${back.id}, expected ${entry.id}`)
      process.exit(1)
    }
    verified++
  }

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        source: 'transcripts WHERE company_id IS NULL (shared Supabase, ticket 04 smart-layer map)',
        row_count: manifest.length,
        rows: manifest,
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Exported ${manifest.length} rows to ${outDir}`)
  console.log(`Verified ${verified}/${manifest.length} files re-read with matching ids`)
  console.log(`Files on disk: ${readdirSync(outDir).length} (rows + manifest.json)`)
}

main()
