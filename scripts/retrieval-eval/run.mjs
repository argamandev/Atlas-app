// Retrieval eval harness — smart-layer ticket 07, kept as the standing quality gate.
//
//   node scripts/retrieval-eval/run.mjs            # full run (needs GEMINI_API_KEY + OPENAI_API_KEY)
//   node scripts/retrieval-eval/run.mjs --lexical  # lexical-only (no embedding APIs, free)
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

// Transcript windows: accumulate lines inside a section; cut at a speaker seam once past
// TARGET chars, hard-cut at MAX. Keeps short Q&A pairs in one window (case 05, case 16).
const WIN = { TARGET: 700, MAX: 1100 }

function chunkTranscript(t, speakersById) {
  const out = []
  for (const sec of t.formatted_data?.sections ?? []) {
    let cur = null
    const flush = () => {
      if (!cur || !cur.text.trim()) {
        cur = null
        return
      }
      out.push({
        key: `t:${t.id}:${cur.first}-${cur.last}`,
        kind: 'transcript',
        srcId: t.id,
        company: t.companyName,
        firstLine: cur.first,
        lastLine: cur.last,
        content: cur.text.trim(),
        embInput:
          `${t.companyName} · שיחת ועידה · ${sec.title} · ${[...cur.speakers].join(', ')}:\n` +
          cur.text.trim(),
      })
      cur = null
    }
    for (const line of sec.lines ?? []) {
      const text = (line.text ?? '').trim()
      if (!text) continue
      const speaker = speakersById[line.speakerId] ?? line.speakerId ?? '?'
      if (
        cur &&
        (cur.text.length + text.length > WIN.MAX ||
          (cur.text.length >= WIN.TARGET && speaker !== cur.lastSpeaker))
      )
        flush()
      if (!cur) cur = { first: lineNo(line.id), speakers: new Set(), text: '', lastSpeaker: speaker }
      cur.text += (cur.text ? '\n' : '') + text
      cur.last = lineNo(line.id)
      cur.lastSpeaker = speaker
      cur.speakers.add(speaker)
    }
    flush()
  }
  return out
}

// Filings: page-as-chunk; oversized pages split on line boundaries, all parts keep page_no.
const PAGE_SPLIT = 3500,
  PAGE_PART = 2200

function chunkPage(doc, page) {
  const text = (page.text ?? '').trim()
  if (!text) return []
  const prefix = (part) =>
    `${doc.companyName} · ${doc.title} · עמ' ${page.page_no}${part ? ` (${part})` : ''}:\n`
  const mk = (body, part) => ({
    key: `d:${doc.id}:${page.page_no}${part ? `:${part}` : ''}`,
    kind: 'document',
    srcId: doc.id,
    company: doc.companyName,
    page: page.page_no,
    content: body,
    embInput: prefix(part) + body,
  })
  if (text.length <= PAGE_SPLIT) return [mk(text, 0)]
  const parts = []
  let buf = ''
  for (const ln of text.split('\n')) {
    if (buf && buf.length + ln.length > PAGE_PART) {
      parts.push(buf)
      buf = ''
    }
    buf += (buf ? '\n' : '') + ln
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((p, i) => mk(p, i + 1))
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
    const speakersById = Object.fromEntries(
      (t.formatted_data?.speakers ?? []).map((s) => [s.id, s.name || s.title || s.id])
    )
    const tChunks = chunkTranscript(t, speakersById)
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

// ---------------------------------------------------------------- main

async function main() {
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

  console.log('Scoring…')
  const results = {} // design → case id → result
  const debug = {}
  for (const [name, rank] of Object.entries(designs)) {
    results[name] = {}
    debug[name] = {}
    for (const c of scoredCases) {
      const ranked = rank(c.query, c.id, c)
      debug[name][c.id] = ranked.slice(0, TOP_K).map(({ i, s }) => ({
        key: chunks[i].key,
        company: chunks[i].company,
        score: Number(s.toFixed(4)),
      }))
      if (c.mode === 'info') {
        results[name][c.id] = { info: debug[name][c.id].slice(0, 5) }
      } else if (c.mode === 'company') {
        results[name][c.id] = { rank: firstCompanyRank(ranked, chunks, c.expectCompany) }
      } else if (c.mode === 'duplicate') {
        results[name][c.id] = {
          rank: rankAllCovered(ranked, chunks, c.anchors),
          dupRank: bestTranscriptRank(ranked, chunks, c.duplicate),
        }
      } else {
        results[name][c.id] = { rank: rankAllCovered(ranked, chunks, c.anchors) }
      }
    }
  }

  // ------------------------------------------------------------ report
  const ranked = scoredCases.filter((c) => c.mode !== 'info')
  const fmtRank = (r) => (r === Infinity ? '—' : String(r))
  const lines = []
  lines.push('# Retrieval eval — run ' + new Date().toISOString())
  lines.push('')
  lines.push(
    `Corpus: ${chunks.length} chunks — ${tChunks} transcript windows (target ${WIN.TARGET}/max ${WIN.MAX} chars, speaker-seam cuts), ${dChunks} filing page chunks (split over ${PAGE_SPLIT} chars).`
  )
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
  lines.push('## Design A — scoped long-context arithmetic (measured token counts)')
  lines.push('')
  lines.push('| Transcript | company | chars | ~tokens |')
  lines.push('| --- | --- | --- | --- |')
  for (const t of stats.transcripts)
    lines.push(`| ${t.id} | ${t.company} | ${t.chars.toLocaleString()} | ${t.tokens.toLocaleString()} |`)
  const allT = stats.transcripts.reduce((n, t) => n + t.tokens, 0)
  lines.push('')
  lines.push(
    `All transcripts together ≈ **${allT.toLocaleString()} tokens** (whole-transcript-corpus stuffing is viable today). ` +
      `All filing pages ≈ **${Math.round(stats.docChars / 2.3).toLocaleString()} tokens** (${stats.docChars.toLocaleString()} chars — NOT stuffable).`
  )
  lines.push('')
  lines.push('## Spend this run')
  lines.push('')
  lines.push(
    `- Gemini embedding input: ${spend.geminiChars.toLocaleString()} chars sent (≈ ${Math.round(spend.geminiChars / 2.3).toLocaleString()} tokens; ~$${((spend.geminiChars / 2.3 / 1e6) * 0.15).toFixed(2)} at the unverified $0.15/M)`
  )
  lines.push(
    `- OpenAI embedding input: ${spend.openaiTokens.toLocaleString()} tokens metered (~$${((spend.openaiTokens / 1e6) * 0.13).toFixed(2)} at the unverified $0.13/M)`
  )
  lines.push('')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outMd = join(RESULTS, `run-${stamp}.md`)
  writeFileSync(outMd, lines.join('\n'), 'utf8')
  writeFileSync(join(RESULTS, `debug-${stamp}.json`), JSON.stringify(debug, null, 1), 'utf8')
  console.log('\n' + lines.join('\n'))
  console.log(`\nWritten: ${outMd}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
