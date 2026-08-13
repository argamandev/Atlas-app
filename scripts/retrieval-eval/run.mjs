// Retrieval eval harness — smart-layer ticket 07, kept as the standing quality gate.
//
//   node --import tsx scripts/retrieval-eval/run.mjs            # full run (needs GEMINI_API_KEY + OPENAI_API_KEY)
//   node --import tsx scripts/retrieval-eval/run.mjs --lexical  # lexical-only (no embedding APIs, free)
//
// `--import tsx` because the chunker is the PRODUCTION module (src/lib/corpus/chunker.ts)
// — one chunker, by law (ingestion standard §5): a harness measuring a copy certifies a
// fiction. The local copy this file carried until slice A3 is deleted, not preserved.
//
// Measures the candidate retrieval designs from research/01 against the founder-approved
// eval set (docs/eval/retrieval-eval-set.md, mirrored in cases.json) on the REAL corpus:
//
//   L               BM25 lexical only ('simple'-tokenizer + Hebrew prefix dual-indexing)
//   B-gemini        dense-only, gemini-embedding-001 @1536 (MRL, re-normalized)
//   B-openai        dense-only, text-embedding-3-large @1536
//   C-gemini/-oai   hybrid: dense + BM25 fused with RRF (rrf_k=50, weights 1/1)
//   B-gemini-nopfx  ablation: dense without the deterministic metadata prefix
//
// Everything runs IN PROCESS over chunks built the way the chosen design would build them
// (line-windows on speaker seams for transcripts, page-as-chunk for filings, deterministic
// metadata prefix in the EMBEDDED text only — stored content stays verbatim, anchors pure).
// No pgvector, no migration: installing the extension is a conclusion of this eval, not a
// prerequisite. Design A (scoped long-context stuffing) is reported as measured token
// counts + cost arithmetic — its retrieval step is trivially "everything in scope".
//
// Scoring rule (from the eval set): a design passes a case when the anchored source is in
// what it retrieves — here: the smallest k at which top-k covers ALL the case's anchors.
// Embeddings are cached in cache/ (git-ignored); reruns hit the APIs only for new text.

import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  chunkTranscriptSections,
  chunkFilingPage,
  speakersById,
  WINDOW,
  PAGE,
} from '../../src/lib/corpus/chunker.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CACHE = join(HERE, 'cache')
const RESULTS = join(HERE, 'results')
mkdirSync(CACHE, { recursive: true })
mkdirSync(RESULTS, { recursive: true })

for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const LEXICAL_ONLY = process.argv.includes('--lexical')
// --real: score the PRODUCTION pipeline (pgvector + the real Postgres lexical
// channel) instead of the in-process simulation. Slice A4's acceptance gate.
const REAL = process.argv.includes('--real')
const REAL_DEPTH = Number((process.argv.find((a) => a.startsWith('--depth=')) ?? '--depth=300').split('=')[1])
// The per-channel candidate pool RRF fuses over. Bigger than the corpus on
// purpose: the in-process run ranked every chunk, and fusing over a subset would
// measure the subset.
//
// ⚠ THE ef_search CEILING IS NOW CAUGHT — but read what the flag means before
// trusting it. Through slice A4 `truncated` compared a channel's row count against
// THIS pool alone, so a dense channel capped at pgvector's 1000-row `ef_search`
// ceiling while under 5000 was reported complete. Harmless at 3,181 chunks (the
// planner answered exactly by seq scan, returning all of them) and precisely the
// hazard at A5 scale, where a 5000-row pool CANNOT be filled by an index scan.
// Migration 031 closed it: the channel now also reports how much was in scope,
// capped at pool + 1, and `truncated` means "returned less than both what was
// asked for and what was there". A truncation printed below is therefore a real
// one, and at this pool it most likely means the ANN index engaged — which is the
// thing A5's re-run exists to find out about.
const REAL_POOL = 5000
const TOP_K = 20

// ---------------------------------------------------------------- corpus → chunks

// plan.ts calibration: 2.1 chars/token Hebrew, 3.9 Latin.
function estimateTokens(text) {
  let heb = 0
  for (const ch of text) if (ch >= '֐' && ch <= '׿') heb += 1
  const other = text.length - heb
  return Math.round(heb / 2.1 + other / 3.9)
}

const lineNo = (id) => parseInt(String(id).replace(/\D/g, ''), 10)

// Both chunk shapes come from THE production chunker (imported above). These two wrappers
// only translate its output to the harness's own row shape (key/srcId/company).
function chunkTranscript(t, byId) {
  return chunkTranscriptSections(t.formatted_data?.sections ?? [], t.companyName, byId).map((c) => ({
    key: `t:${t.id}:${c.firstLine}-${c.lastLine}`,
    kind: 'transcript',
    srcId: t.id,
    company: t.companyName,
    firstLine: c.firstLine,
    lastLine: c.lastLine,
    content: c.content,
    embInput: c.embeddingInput,
  }))
}

function chunkPage(doc, page) {
  return chunkFilingPage(page.text ?? '', page.page_no, doc.companyName, doc.title).map((c) => ({
    key: `d:${doc.id}:${page.page_no}${c.partNo ? `:${c.partNo}` : ''}`,
    kind: 'document',
    srcId: doc.id,
    company: doc.companyName,
    page: page.page_no,
    content: c.content,
    embInput: c.embeddingInput,
  }))
}

async function loadCorpus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Every table is paged: Supabase caps unranged selects at 1000 rows, and a standing gate
  // that silently measures a truncated corpus would report green on less than it claims (M1).
  async function pagedSelect(table, columns, orderCols) {
    const rows = []
    for (let from = 0; ; from += 1000) {
      let q = db.from(table).select(columns)
      for (const col of orderCols) q = q.order(col)
      const { data, error } = await q.range(from, from + 999)
      if (error) throw error
      rows.push(...data)
      if (data.length < 1000) return rows
    }
  }

  const companies = await pagedSelect('companies', 'id,name', ['id'])
  const companyName = Object.fromEntries(companies.map((c) => [c.id, c.name]))
  const transcripts = await pagedSelect('transcripts', 'id,company_id,formatted_data', ['id'])
  const docs = await pagedSelect('company_documents', 'id,company_id,title', ['id'])
  const pages = await pagedSelect('document_pages', 'document_id,page_no,text', ['document_id', 'page_no'])

  const chunks = []
  const stats = { transcripts: [], docChars: 0 }
  for (const t of transcripts) {
    t.companyName = companyName[t.company_id] ?? 'ללא שיוך'
    const tChunks = chunkTranscript(t, speakersById(t.formatted_data?.speakers))
    chunks.push(...tChunks)
    const chars = tChunks.reduce((n, c) => n + c.content.length, 0)
    stats.transcripts.push({
      id: t.id,
      company: t.companyName,
      chars,
      tokens: estimateTokens(tChunks.map((c) => c.content).join('\n')),
    })
  }
  const docById = Object.fromEntries(
    docs.map((d) => [d.id, { ...d, companyName: companyName[d.company_id] ?? '?' }])
  )
  for (const p of pages) {
    const doc = docById[p.document_id]
    if (!doc) continue
    chunks.push(...chunkPage(doc, p))
    stats.docChars += (p.text ?? '').length
  }
  return { chunks, stats }
}

// ---------------------------------------------------------------- embeddings + cache

const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex')

function loadCache(provider) {
  const file = join(CACHE, `emb-${provider}.jsonl`)
  const map = new Map()
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const { k, v } = JSON.parse(line)
        map.set(k, v)
      } catch {
        /* torn tail line */
      }
    }
  }
  return {
    map,
    file,
    put(k, v) {
      map.set(k, v)
      appendFileSync(this.file, JSON.stringify({ k, v }) + '\n')
    },
  }
}

async function withRetry(fn, label) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= 5) throw e
      const wait = 1000 * 2 ** attempt
      console.warn(`  ${label}: ${e.message} — retry in ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

const spend = { geminiChars: 0, openaiTokens: 0 }

function normalize(v) {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => Number((x / n).toFixed(6)))
}

async function embedGemini(texts, taskType) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const out = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const body = {
      requests: batch.map((text) => ({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 1536,
      })),
    }
    const res = await withRetry(
      async () => {
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body),
          }
        )
        if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`)
        return r.json()
      },
      `gemini batch ${i / 100 + 1}`
    )
    // MRL truncation to 1536 loses unit norm — re-normalize (per Google's own guidance).
    out.push(...res.embeddings.map((e) => normalize(e.values)))
    for (const t of batch) spend.geminiChars += t.length
    if (i + 100 < texts.length) await new Promise((r) => setTimeout(r, 200))
  }
  return out
}

async function embedOpenAI(texts) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  const out = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const res = await withRetry(
      async () => {
        const r = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: 'text-embedding-3-large', input: batch, dimensions: 1536 }),
        })
        if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`)
        return r.json()
      },
      `openai batch ${i / 100 + 1}`
    )
    out.push(...res.data.map((d) => d.embedding.map((x) => Number(x.toFixed(6)))))
    spend.openaiTokens += res.usage?.prompt_tokens ?? 0
    if (i + 100 < texts.length) await new Promise((r) => setTimeout(r, 200))
  }
  return out
}

// Embed `texts` under `provider`, via cache. Gemini keys include taskType (asymmetric model).
async function embedAll(provider, texts, taskType) {
  const cache = loadCache(provider)
  const keyOf = provider === 'gemini' ? (t) => sha1(`${taskType} ${t}`) : (t) => sha1(t)
  const missing = []
  for (const t of texts) if (!cache.map.has(keyOf(t))) missing.push(t)
  if (missing.length) {
    console.log(
      `  ${provider}/${taskType}: embedding ${missing.length} new texts (${texts.length - missing.length} cached)`
    )
    const embs = provider === 'gemini' ? await embedGemini(missing, taskType) : await embedOpenAI(missing)
    missing.forEach((t, i) => cache.put(keyOf(t), embs[i]))
  }
  return texts.map((t) => cache.map.get(keyOf(t)))
}

// ---------------------------------------------------------------- lexical channel (BM25)

// The 'simple'-config simulation from research/01 §3: lowercase, split on non-word chars,
// and dual-index Hebrew tokens with one leading clitic (ו/ה/ב/ל/מ/ש/כ) stripped — the same
// normalization plan.ts already uses for term overlap.
function tokenize(text) {
  const raw = text
    .toLowerCase()
    .replace(/[^0-9a-z֐-׿\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
  const out = []
  for (const w of raw) {
    out.push(w)
    if (/^[֐-׿]/.test(w) && w.length > 3 && /^[והבלמשכ]/.test(w)) out.push(w.slice(1))
  }
  return out
}

function buildBM25(chunks) {
  const docs = chunks.map((c) => tokenize(c.embInput))
  const df = new Map()
  for (const toks of docs) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / N
  const tfs = docs.map((toks) => {
    const tf = new Map()
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    return tf
  })
  const k1 = 1.2,
    b = 0.75
  return function score(query) {
    const qterms = [...new Set(tokenize(query))]
    const scores = new Float64Array(N)
    for (const q of qterms) {
      const n = df.get(q)
      if (!n) continue
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      for (let i = 0; i < N; i += 1) {
        const f = tfs[i].get(q)
        if (!f) continue
        scores[i] += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + b * (docs[i].length / avgLen)))
      }
    }
    return scores
  }
}

// ---------------------------------------------------------------- ranking + fusion

function rankDense(queryEmb, docEmbs) {
  const scored = docEmbs.map((e, i) => {
    let dot = 0
    for (let j = 0; j < e.length; j += 1) dot += e[j] * queryEmb[j]
    return { i, s: dot }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored
}

function rankLexical(bm25, query) {
  const scores = bm25(query)
  const scored = []
  for (let i = 0; i < scores.length; i += 1) if (scores[i] > 0) scored.push({ i, s: scores[i] })
  scored.sort((a, b) => b.s - a.s)
  return scored
}

// RRF over ranked lists (rrf_k=50, weights 1/1 — the Supabase recipe's defaults).
function fuseRRF(lists) {
  const RRF_K = 50
  const fused = new Map()
  for (const list of lists) {
    list.forEach(({ i }, rank) => fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + rank + 1)))
  }
  return [...fused.entries()].map(([i, s]) => ({ i, s })).sort((a, b) => b.s - a.s)
}

// ---------------------------------------------------------------- scoring

// Rank at which the top of `ranked` covers ALL of the case's anchors.
// A transcript anchor line is covered by a chunk whose [firstLine,lastLine] contains it;
// multi-line anchors may be covered by the union of several retrieved chunks.
function rankAllCovered(ranked, chunks, anchors) {
  const needs = []
  for (const a of anchors) {
    if (a.transcript) for (const l of a.lines) needs.push({ t: a.transcript, line: lineNo(l) })
    else needs.push({ d: a.document, page: a.page })
  }
  const done = new Array(needs.length).fill(false)
  let left = needs.length
  for (let r = 0; r < ranked.length; r += 1) {
    const c = chunks[ranked[r].i]
    for (let n = 0; n < needs.length; n += 1) {
      if (done[n]) continue
      const need = needs[n]
      const hit = need.t
        ? c.kind === 'transcript' && c.srcId === need.t && c.firstLine <= need.line && need.line <= c.lastLine
        : c.kind === 'document' && c.srcId === need.d && c.page === need.page
      if (hit) {
        done[n] = true
        left -= 1
      }
    }
    if (left === 0) return r + 1
  }
  return Infinity
}

function firstCompanyRank(ranked, chunks, company) {
  for (let r = 0; r < ranked.length; r += 1) {
    if (chunks[ranked[r].i].company?.includes(company)) return r + 1
  }
  return Infinity
}

function bestTranscriptRank(ranked, chunks, transcriptId) {
  for (let r = 0; r < ranked.length; r += 1) {
    const c = chunks[ranked[r].i]
    if (c.kind === 'transcript' && c.srcId === transcriptId) return r + 1
  }
  return Infinity
}

// Rank of the first chunk covering ANY of the given anchors (diagnostic for discovery leads).
function firstAnchorRank(ranked, chunks, anchors) {
  for (let r = 0; r < ranked.length; r += 1) {
    const c = chunks[ranked[r].i]
    for (const a of anchors) {
      const hit = a.transcript
        ? c.kind === 'transcript' &&
          c.srcId === a.transcript &&
          a.lines.some((l) => c.firstLine <= lineNo(l) && lineNo(l) <= c.lastLine)
        : c.kind === 'document' && c.srcId === a.document && c.page === a.page
      if (hit) return r + 1
    }
  }
  return Infinity
}

// Discovery (class G): market-wide question whose answer is a per-company-diversified leads
// list (ticket 08). Companies are ordered by their best-ranked chunk; the case's rank is the
// company-position at which ALL documented lead companies have appeared (pass gate in the
// eval set: ≤ 5). anchorRank is evidence for the answer layer, never a gate — a lead company
// surfaced on a different-but-relevant chunk still counts as found.
const DISCOVERY_PASS_K = 5

function scoreDiscovery(ranked, chunks, c) {
  // A malformed case must fail loudly: leads:[] would score rank 0 and silently pass
  // every design — a green signal that measured nothing (M1).
  if (!c.leads?.length) throw new Error(`case ${c.id}: mode "discovery" requires a non-empty leads[]`)
  const order = [] // distinct companies by best chunk rank
  const seen = new Set()
  for (const { i } of ranked) {
    const name = chunks[i].company
    if (!name || seen.has(name)) continue
    seen.add(name)
    order.push(name)
  }
  const leads = {}
  let worst = 0
  for (const lead of c.leads) {
    const pos = order.findIndex((n) => n.includes(lead.company))
    const companyRank = pos === -1 ? Infinity : pos + 1
    leads[lead.company] = { companyRank, anchorRank: firstAnchorRank(ranked, chunks, lead.anchors) }
    worst = Math.max(worst, companyRank)
  }
  return { rank: worst, leads, companiesTop: order.slice(0, 8) }
}

// ---------------------------------------------------------------- the REAL pipeline (--real)

// Everything above this line is the in-process SIMULATION the design was chosen
// on: brute-force cosine and an in-memory BM25 standing in for a 'simple'
// tsvector. Everything below scores what a user's question will actually run
// through — src/lib/corpus/retrieve.ts over pgvector and the real dual-form
// tsvector, the same module and the same SQL, with nothing re-implemented here.
// A harness measuring a copy certifies a fiction (ingestion standard §5).

async function buildRealDesigns() {
  const { retrieveChunks } = await import('../../src/lib/corpus/retrieve.ts')
  const { resolveCompany } = await import('../../src/lib/company/resolve.ts')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: companies } = await db.from('companies').select('id, name')
  const companyName = Object.fromEntries((companies ?? []).map((c) => [c.id, c.name]))
  const { data: aliases } = await db.from('company_aliases').select('company_id, alias, kind')
  const aliasRows = (aliases ?? []).map((a) => ({ companyId: a.company_id, alias: a.alias, kind: a.kind }))

  // The corpus AS INDEXED — counted from the table, never restated from the
  // chunker's own idea of how many chunks it produced (M1).
  const count = async (q) => (await q).count ?? 0
  const total = await count(db.from('document_chunks').select('id', { count: 'exact', head: true }))
  const tCount = await count(
    db.from('document_chunks').select('id', { count: 'exact', head: true }).eq('source_type', 'transcript')
  )
  const unembedded = await count(
    db.from('document_chunks').select('id', { count: 'exact', head: true }).is('embedding', null)
  )

  const toChunk = (r) => ({
    key: r.transcriptId
      ? `t:${r.transcriptId}:${lineNo(r.firstLineId)}-${lineNo(r.lastLineId)}`
      : `d:${r.documentId}:${r.pageNo}${r.partNo ? `:${r.partNo}` : ''}`,
    kind: r.sourceType === 'transcript' ? 'transcript' : 'document',
    srcId: r.transcriptId ?? r.documentId,
    company: companyName[r.companyId] ?? '?',
    firstLine: r.firstLineId ? lineNo(r.firstLineId) : null,
    lastLine: r.lastLineId ? lineNo(r.lastLineId) : null,
    page: r.pageNo,
    content: r.content,
  })

  // The case's documented scope, resolved through the PRODUCTION resolver against
  // the live alias table — the same call `resolve_company` will make. `undefined`
  // means "this case has no scope"; `null` means "the resolver could not resolve
  // it", which is a different fact and is reported as such rather than quietly
  // becoming an unscoped search.
  const scopeCache = new Map()
  const scopeIdFor = (c) => {
    if (!c?.scope) return undefined
    if (!scopeCache.has(c.scope)) scopeCache.set(c.scope, resolveCompany(c.scope, aliasRows))
    return scopeCache.get(c.scope)
  }

  // Every channel truncation this run hits, collected as it happens. A ranking
  // measured over a candidate pool that filled up is a ranking over less than
  // the corpus, and the report must say so rather than let the numbers imply
  // otherwise (M1).
  const truncations = []

  const design = (channels, scoped) => async (q, id, c) => {
    const companyId = scoped ? (scopeIdFor(c) ?? null) : null
    const res = await retrieveChunks(db, {
      query: q,
      companyId,
      channels,
      limit: REAL_DEPTH,
      // FUSE OVER THE WHOLE CORPUS, report the top REAL_DEPTH. The in-process
      // run ranked all 3,202 chunks, so a small candidate pool here would not be
      // measuring the same design — it would be measuring the pool.
      candidates: REAL_POOL,
    })
    for (const [name, ch] of [
      ['dense', res.dense],
      ['lexical', res.lexical],
    ]) {
      if (ch.truncated)
        truncations.push(
          `case ${id} · ${channels}${scoped ? '-scoped' : ''} · ${name} channel was CUT SHORT: ` +
            `${ch.saw} rows for a ${REAL_POOL}-row request, with ≥${ch.inScopeCapped} in scope`
        )
    }
    const chunks = res.chunks.map(toChunk)
    return { ranked: chunks.map((_, i) => ({ i, s: res.chunks[i].score })), chunks }
  }

  return {
    designs: {
      'L-real': design('lexical', false),
      'B-gemini-real': design('dense', false),
      'C-gemini-real': design('hybrid', false),
      'B-gemini-scoped-real': design('dense', true),
      'C-gemini-scoped-real': design('hybrid', true),
    },
    scopeIdFor,
    companyName,
    truncations,
    stats: { total, tCount, dCount: total - tCount, unembedded },
  }
}

// ---------------------------------------------------------------- main

async function main() {
  if (REAL) return mainReal()
  console.log('Loading corpus…')
  const { chunks, stats } = await loadCorpus()
  const tChunks = chunks.filter((c) => c.kind === 'transcript').length
  const dChunks = chunks.length - tChunks
  console.log(`  ${chunks.length} chunks (${tChunks} transcript windows, ${dChunks} page chunks)`)

  const { cases } = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'))
  const scoredCases = cases.filter((c) => c.mode !== 'skip')

  console.log('Building BM25 index…')
  const bm25 = buildBM25(chunks)

  // Design channels. Each design maps a case query → ranked [{i,s}] over `chunks`.
  const designs = { L: (q) => rankLexical(bm25, q) }

  if (!LEXICAL_ONLY) {
    const queries = scoredCases.map((c) => c.query)
    console.log('Embedding corpus + queries (cache-aware)…')
    const [gDocs, gDocsNopfx, oDocs] = [
      await embedAll(
        'gemini',
        chunks.map((c) => c.embInput),
        'RETRIEVAL_DOCUMENT'
      ),
      await embedAll(
        'gemini',
        chunks.map((c) => c.content),
        'RETRIEVAL_DOCUMENT'
      ),
      await embedAll(
        'openai',
        chunks.map((c) => c.embInput)
      ),
    ]
    const gQ = await embedAll('gemini', queries, 'RETRIEVAL_QUERY')
    const oQ = await embedAll('openai', queries)
    const qEmb = (provider) =>
      Object.fromEntries(scoredCases.map((c, i) => [c.id, provider === 'gemini' ? gQ[i] : oQ[i]]))
    const gq = qEmb('gemini'),
      oq = qEmb('openai')

    designs['B-gemini'] = (q, id) => rankDense(gq[id], gDocs)
    designs['B-openai'] = (q, id) => rankDense(oq[id], oDocs)
    designs['C-gemini'] = (q, id) => fuseRRF([rankDense(gq[id], gDocs), rankLexical(bm25, q)])
    designs['C-openai'] = (q, id) => fuseRRF([rankDense(oq[id], oDocs), rankLexical(bm25, q)])
    designs['B-gemini-nopfx'] = (q, id) => rankDense(gq[id], gDocsNopfx)

    // The full Design B/C from research/01 §6/§8: when the query resolves to a company
    // (via the decided alias table), retrieval FILTERS by company_id instead of hoping the
    // embedding lands. cases.json carries `scope` = the resolved company name; a case with
    // no resolvable scope ranks globally. For the dense channel, post-filtering the global
    // ranking is exactly pre-filtering the corpus (relative order within scope is
    // unchanged). For the RRF-fused designs it is an APPROXIMATION: RRF weights here come
    // from GLOBAL ranks, while a production pre-filtered hybrid would fuse scope-local
    // ranks and can order differently. The scoped-hybrid numbers are therefore a floor-ish
    // estimate, not an exact simulation — rerun with true pre-filtering before treating
    // small scoped-vs-scoped deltas as real.
    const scoped = (inner) => (q, id, c) => {
      const ranked = inner(q, id)
      return c?.scope ? ranked.filter(({ i }) => chunks[i].company?.includes(c.scope)) : ranked
    }
    designs['C-gemini-scoped'] = scoped(designs['C-gemini'])
    designs['B-gemini-scoped'] = scoped(designs['B-gemini'])
  }

  // Design A — scoped long-context arithmetic. In-process only: it is measured
  // from the raw corpus, not from a ranking, so --real has nothing to add to it.
  const designA = ['## Design A — scoped long-context arithmetic (measured token counts)', '']
  designA.push('| Transcript | company | chars | ~tokens |', '| --- | --- | --- | --- |')
  for (const t of stats.transcripts)
    designA.push(`| ${t.id} | ${t.company} | ${t.chars.toLocaleString()} | ${t.tokens.toLocaleString()} |`)
  const allT = stats.transcripts.reduce((n, t) => n + t.tokens, 0)
  designA.push(
    '',
    `All transcripts together ≈ **${allT.toLocaleString()} tokens** (whole-transcript-corpus stuffing is viable today). ` +
      `All filing pages ≈ **${Math.round(stats.docChars / 2.3).toLocaleString()} tokens** (${stats.docChars.toLocaleString()} chars — NOT stuffable).`,
    '',
    '## Spend this run',
    '',
    `- Gemini embedding input: ${spend.geminiChars.toLocaleString()} chars sent (≈ ${Math.round(spend.geminiChars / 2.3).toLocaleString()} tokens; ~$${((spend.geminiChars / 2.3 / 1e6) * 0.15).toFixed(2)} at the unverified $0.15/M)`,
    `- OpenAI embedding input: ${spend.openaiTokens.toLocaleString()} tokens metered (~$${((spend.openaiTokens / 1e6) * 0.13).toFixed(2)} at the unverified $0.13/M)`,
    ''
  )

  return scoreAndReport({
    designs,
    chunks,
    scoredCases,
    title: '# Retrieval eval — run ' + new Date().toISOString(),
    corpusLine: `Corpus: ${chunks.length} chunks — ${tChunks} transcript windows (target ${WINDOW.TARGET}/max ${WINDOW.MAX} chars, speaker-seam cuts), ${dChunks} filing page chunks (split over ${PAGE.SPLIT} chars).`,
    tail: designA,
  })
}

/**
 * Score every design over every case and write the report. Shared by the
 * in-process run and --real, deliberately: two report writers would let the two
 * measurements diverge in presentation and hide a real difference in the noise.
 */
async function scoreAndReport({ designs, chunks, scoredCases, title, corpusLine, tail }) {
  console.log('Scoring…')
  const results = {} // design → case id → result
  const debug = {}
  for (const [name, rank] of Object.entries(designs)) {
    results[name] = {}
    debug[name] = {}
    for (const c of scoredCases) {
      // A design returns either a ranking over the GLOBAL chunk array (in-process
      // designs) or its own {ranked, chunks} pair (the --real designs, whose rows
      // come back from the database one query at a time).
      const got = await rank(c.query, c.id, c)
      const ranked = Array.isArray(got) ? got : got.ranked
      const over = Array.isArray(got) ? chunks : got.chunks
      debug[name][c.id] = ranked.slice(0, TOP_K).map(({ i, s }) => ({
        key: over[i].key,
        company: over[i].company,
        score: Number(s.toFixed(4)),
      }))
      if (c.mode === 'info') {
        results[name][c.id] = { info: debug[name][c.id].slice(0, 5) }
      } else if (c.mode === 'discovery') {
        results[name][c.id] = scoreDiscovery(ranked, over, c)
      } else if (c.mode === 'company') {
        results[name][c.id] = { rank: firstCompanyRank(ranked, over, c.expectCompany) }
      } else if (c.mode === 'duplicate') {
        results[name][c.id] = {
          rank: rankAllCovered(ranked, over, c.anchors),
          dupRank: bestTranscriptRank(ranked, over, c.duplicate),
        }
      } else {
        results[name][c.id] = { rank: rankAllCovered(ranked, over, c.anchors) }
      }
    }
  }

  // ------------------------------------------------------------ report
  const ranked = scoredCases.filter((c) => c.mode !== 'info' && c.mode !== 'discovery')
  const fmtRank = (r) => (r === Infinity ? '—' : String(r))
  const lines = []
  lines.push(title)
  lines.push('')
  lines.push(corpusLine)
  lines.push('')
  lines.push("## Summary (rank at which ALL of a case's anchors are covered; lower is better)")
  lines.push('')
  lines.push('| Design | hit@5 | hit@20 | MRR | cases missed@20 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const name of Object.keys(designs)) {
    let h5 = 0,
      h20 = 0,
      mrr = 0
    const missed = []
    for (const c of ranked) {
      const r = results[name][c.id].rank
      if (r <= 5) h5 += 1
      if (r <= 20) h20 += 1
      else missed.push(c.id)
      mrr += r === Infinity ? 0 : 1 / r
    }
    lines.push(
      `| ${name} | ${h5}/${ranked.length} | ${h20}/${ranked.length} | ${(mrr / ranked.length).toFixed(3)} | ${missed.join(', ') || '—'} |`
    )
  }
  lines.push('')
  lines.push('## Per-case anchor rank')
  lines.push('')
  lines.push(`| Case | class | ${Object.keys(designs).join(' | ')} |`)
  lines.push(
    `| --- | --- | ${Object.keys(designs)
      .map(() => '---')
      .join(' | ')} |`
  )
  for (const c of ranked) {
    const cells = Object.keys(designs).map((n) => {
      const r = results[n][c.id]
      return r.dupRank !== undefined ? `${fmtRank(r.rank)} (dup ${fmtRank(r.dupRank)})` : fmtRank(r.rank)
    })
    lines.push(`| ${c.id}${c.wart ? ` (${c.wart})` : ''} | ${c.class} | ${cells.join(' | ')} |`)
  }
  lines.push('')
  const discovery = scoredCases.filter((c) => c.mode === 'discovery')
  if (discovery.length) {
    lines.push(
      `## Discovery cases (class G — company-rank at which ALL lead companies appear; pass ≤ ${DISCOVERY_PASS_K})`
    )
    lines.push('')
    lines.push(`| Case | ${Object.keys(designs).join(' | ')} |`)
    lines.push(
      `| --- | ${Object.keys(designs)
        .map(() => '---')
        .join(' | ')} |`
    )
    for (const c of discovery) {
      const cells = Object.keys(designs).map((n) => {
        const r = results[n][c.id]
        return `${fmtRank(r.rank)} ${r.rank <= DISCOVERY_PASS_K ? '✓' : '✗'}`
      })
      lines.push(`| ${c.id} | ${cells.join(' | ')} |`)
    }
    lines.push('')
    // The quotable verdict, printed by the measurement itself. Prose about a design's
    // discovery result quotes one of these lines verbatim — re-deriving pass/fail from
    // the rank table by hand is how a wrong "fails both" got written once (M1).
    lines.push('Design verdicts (quote these, never re-derive from ranks):')
    lines.push('')
    for (const name of Object.keys(designs)) {
      const failed = discovery.filter((c) => results[name][c.id].rank > DISCOVERY_PASS_K)
      lines.push(
        `- **${name}**: ${failed.length ? `FAIL (case ${failed.map((c) => c.id).join(', ')})` : 'PASS (all discovery cases)'}`
      )
    }
    lines.push('')
    for (const c of discovery) {
      lines.push(`### Case ${c.id} — ${c.query}`)
      for (const name of Object.keys(designs)) {
        const r = results[name][c.id]
        const leadBits = Object.entries(r.leads).map(
          ([company, l]) =>
            `${company}@${fmtRank(l.companyRank)} (anchor chunk rank ${fmtRank(l.anchorRank)})`
        )
        lines.push(`- **${name}**: ${leadBits.join(' · ')} — company order: ${r.companiesTop.join(' → ')}`)
      }
      lines.push('')
    }
  }
  lines.push('## Info cases (15 = attribution trap, 17 = unanswerable)')
  lines.push('')
  for (const c of scoredCases.filter((x) => x.mode === 'info')) {
    lines.push(`### Case ${c.id} — ${c.query}`)
    for (const name of Object.keys(designs)) {
      const top = results[name][c.id].info
      lines.push(
        `- **${name}**: ${
          top.length
            ? top.map((t) => `${t.key} (${t.company ?? '?'}; ${t.score})`).join(' · ')
            : '(empty — the resolved scope has no corpus content; this IS the honest cannot-ground signal)'
        }`
      )
    }
    lines.push('')
  }
  // `tail` may be a THUNK: --real's tail reports the channel truncations this
  // run hit, which are only known once every design has been scored.
  lines.push(...(typeof tail === 'function' ? tail() : tail))

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outMd = join(RESULTS, `run-${REAL ? 'real-' : ''}${stamp}.md`)
  writeFileSync(outMd, lines.join('\n'), 'utf8')
  writeFileSync(
    join(RESULTS, `debug-${REAL ? 'real-' : ''}${stamp}.json`),
    JSON.stringify(debug, null, 1),
    'utf8'
  )
  console.log('\n' + lines.join('\n'))
  console.log(`\nWritten: ${outMd}`)
}

// ---------------------------------------------------------------- main (--real)

async function mainReal() {
  console.log('Scoring the REAL pipeline (pgvector + Postgres tsvector)…')
  const { designs, scopeIdFor, companyName, truncations, stats } = await buildRealDesigns()
  const { cases } = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'))
  const scoredCases = cases.filter((c) => c.mode !== 'skip')

  console.log(
    `  ${stats.total} chunks indexed (${stats.tCount} transcript windows, ${stats.dCount} page chunks)`
  )
  if (stats.unembedded > 0) {
    // A dense channel silently missing rows would report ranks for a corpus
    // smaller than the one it claims to measure (M1). Say it in the report, not
    // only on the console.
    console.log(`  WARNING: ${stats.unembedded} chunk(s) have no embedding`)
  }

  // How each case's documented scope actually resolved, printed rather than
  // assumed: "scoped" means nothing if the resolver returned null and the search
  // quietly ran over the whole market.
  const scopeNotes = []
  for (const c of scoredCases) {
    if (!c.scope) continue
    const id = scopeIdFor(c)
    scopeNotes.push(
      `- case ${c.id}: \`${c.scope}\` → ${id ? `${companyName[id] ?? id}` : '**unresolved** (ran unscoped)'}`
    )
  }

  const tail = () => [
    '## How this run differs from the in-process measurement',
    '',
    `- Ranking is \`atlas_search_chunks\` (migration 029) through \`src/lib/corpus/retrieve.ts\` — pgvector cosine over an HNSW index, \`ts_rank_cd\` over the dual-form \`simple\` tsvector, RRF k=50 weights 1/1.`,
    `- **Ranks are measured to depth ${REAL_DEPTH} only.** Anything deeper reports \`—\`, which is NOT the same as the in-process run's \`—\` (that one searched the whole corpus). hit@5, hit@20 and the MUST-PASS cases are unaffected; MRR contributions below 1/${REAL_DEPTH} are lost.`,
    `- The scoped designs use a TRUE company pre-filter. The in-process scoped numbers were a documented post-filter approximation of it.`,
    `- The lexical channel is \`ts_rank_cd\`, not BM25. Recall (which rows match) is the same tokenizer on both sides; the SCORE function is genuinely different, and that difference is the thing this run exists to measure.`,
    `- OpenAI and the no-prefix ablation are absent by construction: one \`embedding\` column holds one model's vectors, and the corpus is embedded with the prefix as law.`,
    '',
    '### Scope resolution (through the production resolver, against the live alias table)',
    '',
    ...scopeNotes,
    '',
    '## Corpus as indexed',
    '',
    `- \`document_chunks\`: ${stats.total} (${stats.tCount} transcript windows, ${stats.dCount} filing page chunks)`,
    `- chunks missing an embedding: ${stats.unembedded}${stats.unembedded ? ' — **the dense channel cannot see these**' : ''}`,
    '',
    '## Channel truncation',
    '',
    ...(truncations.length
      ? [
          '**Some rankings below were measured over a candidate pool that filled up** — they rank less than the corpus:',
          '',
          ...truncations.map((t) => `- ${t}`),
        ]
      : [
          'None. Every channel saw fewer rows than its candidate pool, so every ranking below is over the whole corpus it was allowed to search.',
        ]),
    '',
  ]

  return scoreAndReport({
    designs,
    chunks: [],
    scoredCases,
    title: '# Retrieval eval — REAL pipeline run ' + new Date().toISOString(),
    corpusLine: `Corpus: ${stats.total} chunks as INDEXED in \`document_chunks\` — ${stats.tCount} transcript windows, ${stats.dCount} filing page chunks. Ranked to depth ${REAL_DEPTH}.`,
    tail,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
