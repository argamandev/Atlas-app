#!/usr/bin/env node
// scripts/transcribe-batch.mjs
//
// Runs a batch of YouTube/Vimeo URLs through the REAL product API, polls each to
// completion, and writes the results to scripts/out/. Used by the /transcript-review
// skill to audit transcript quality end-to-end against a live dev server.
//
// Usage:
//   1. npm run dev            (in another terminal — defaults to http://localhost:3000)
//   2. put one URL per line in scripts/review-urls.txt
//   3. node scripts/transcribe-batch.mjs
//
// Auth: signs in once with REVIEWER_EMAIL / REVIEWER_PASSWORD (a real low-priv user)
// and calls the API with an Authorization: Bearer <access_token> header.
//
// Env (read from .env.local, then .env): NEXT_PUBLIC_SUPABASE_URL,
//   NEXT_PUBLIC_SUPABASE_ANON_KEY, REVIEWER_EMAIL, REVIEWER_PASSWORD.
//   Optional: BASE_URL (default http://localhost:3000).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// --- tiny .env loader (no extra dependency) ---
function loadEnv(file) {
  const p = join(ROOT, file)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}
loadEnv('.env.local')
loadEnv('.env')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = process.env.REVIEWER_EMAIL
const PASSWORD = process.env.REVIEWER_PASSWORD

const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!SUPABASE_URL || !ANON_KEY) fail('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.')
if (!EMAIL || !PASSWORD) fail('Missing REVIEWER_EMAIL / REVIEWER_PASSWORD in .env.local (use a real low-priv account).')

const URLS_FILE = join(__dirname, 'review-urls.txt')
if (!existsSync(URLS_FILE)) fail(`Missing ${URLS_FILE} — add one YouTube/Vimeo URL per line.`)
const urls = readFileSync(URLS_FILE, 'utf8')
  .split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
if (urls.length === 0) fail('scripts/review-urls.txt has no URLs.')

const OUT_DIR = join(__dirname, 'out')
mkdirSync(OUT_DIR, { recursive: true })

const TIMEOUT_MS = 20 * 60 * 1000 // a 1h call transcribes in a few minutes; 20m is a safe ceiling

async function main() {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr || !auth?.session) fail(`Sign-in failed: ${authErr?.message ?? 'no session returned'}`)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}` }

  console.log(`✓ signed in as ${EMAIL}`)
  console.log(`→ target: ${BASE_URL}`)
  console.log(`→ ${urls.length} URL(s)\n`)

  const summary = []

  for (const [i, url] of urls.entries()) {
    console.log(`[${i + 1}/${urls.length}] ${url}`)
    try {
      const postRes = await fetch(`${BASE_URL}/api/transcripts`, { method: 'POST', headers, body: JSON.stringify({ url }) })
      const postBody = await postRes.json().catch(() => ({}))
      if (!postRes.ok || !postBody.id) {
        console.log(`   ✖ submit failed (${postRes.status}): ${postBody.error ?? ''}`)
        summary.push({ url, status: 'submit_failed', error: postBody.error ?? `HTTP ${postRes.status}` })
        console.log('')
        continue
      }
      const id = postBody.id
      console.log(`   id=${id} — polling...`)

      const started = Date.now()
      let row = null
      while (true) {
        await sleep(3000)
        const getRes = await fetch(`${BASE_URL}/api/transcripts/${id}?_t=${Date.now()}`, { headers })
        if (!getRes.ok) { if (getRes.status !== 404) process.stdout.write(`\r   ⚠ poll HTTP ${getRes.status}        `); continue }
        row = await getRes.json()
        process.stdout.write(`\r   step=${row.processing_step ?? '?'} status=${row.status}            `)
        if (row.status === 'completed' || row.status === 'failed') break
        if (Date.now() - started > TIMEOUT_MS) { row.status = 'timeout'; break }
      }
      process.stdout.write('\n')

      if (row.status !== 'completed' || !row.formatted_data) {
        console.log(`   ✖ ${row.status}${row.error_message ? ': ' + row.error_message : ''}`)
        summary.push({ url, id, status: row.status, error: row.error_message ?? null })
        console.log('')
        continue
      }

      const t = row.formatted_data
      writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify(t, null, 2), 'utf8')
      const lines = (t.sections ?? []).reduce((n, s) => n + (s.lines?.length ?? 0), 0)
      console.log(`   ✓ ${t.company ?? '?'} · ${t.quarter ?? '?'} · ${t.engine ?? '?'}${t.model ? ' (' + t.model + ')' : ''} · ${lines} lines`)
      summary.push({
        url, id, status: 'completed',
        company: t.company ?? null, quarter: t.quarter ?? null,
        engine: t.engine ?? null, model: t.model ?? null,
        processingSecs: t.processingSecs ?? null, lines,
      })
    } catch (e) {
      console.log(`   ✖ error: ${e.message}`)
      summary.push({ url, status: 'error', error: e.message })
    }
    console.log('')
  }

  writeFileSync(
    join(OUT_DIR, '_run.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), baseUrl: BASE_URL, results: summary }, null, 2),
    'utf8',
  )
  const ok = summary.filter((s) => s.status === 'completed').length
  console.log(`Done. ${ok}/${urls.length} completed.`)
  console.log('Results in scripts/out/  (per-transcript <id>.json + _run.json)')
}

main().catch((e) => fail(e.stack || e.message))
