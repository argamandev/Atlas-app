// Throwaway probe: does an UNSCOPED retrieve complete against the real corpus?
// Ticket 07 measurement — the tool loop reported `search failed` three times on
// the market-wide channel, and the honest next question is whether that is the
// index, the embedding call, or a statement timeout.
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const { retrieveChunks } = await import('../src/lib/corpus/retrieve.ts')
const { supabaseAdmin } = await import('../src/lib/supabase.ts')

const query = process.argv.slice(2).join(' ') || 'עליית הריבית'
const companyId = process.env.PROBE_COMPANY_ID || null

const t0 = Date.now()
try {
  const r = await retrieveChunks(supabaseAdmin, { query, companyId })
  console.log(`OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log('chunks:', r.chunks.length)
  console.log('dense:', JSON.stringify(r.dense))
  console.log('lexical:', JSON.stringify(r.lexical))
  console.log('companies represented:', new Set(r.chunks.map((c) => c.companyId)).size)
} catch (err) {
  console.log(`FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log('error:', err.message)
}
