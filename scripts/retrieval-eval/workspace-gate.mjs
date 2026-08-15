// ─────────────────────────────────────────────────────────────────────────────
// THE B3 GATE — does the new retrieval measurably beat the planner INSIDE A
// WORKSPACE? (smart-layer ticket 09)
//
//   node --import tsx scripts/retrieval-eval/workspace-gate.mjs
//
// Ticket 09 ships the swap ONLY if this comparison says so, and the ticket is
// explicit that a measured "the planner won, workspace left alone" is a
// COMPLETED ticket. So this file is written to be able to say that: it is not
// scored to pass (app.md M2), and every arm is fed the same shelf, the same
// windows where it can be, and the same token budget.
//
// WHY THE STANDING HARNESS (run.mjs) CANNOT ANSWER THIS. That one ranks the
// whole corpus and asks "is the anchor in the top-k". A workspace is a different
// question in three ways, and each one is a reason the planner might legitimately
// hold:
//
//   · THE SCOPE IS A SHELF, not a company and not the market. Term overlap across
//     six files is a different problem from ANN over 98,000 chunks.
//   · THE OUTPUT IS A PROMPT, not a ranked list. What counts is whether the
//     anchor is in the text the model was actually sent, under a real budget —
//     so both arms are scored after the SAME budget-spending code has run.
//   · A SHELF ITEM NEED NOT BE IN THE CORPUS at all. That is why arm E scores the
//     planner's own windows rather than requiring an indexed chunk to exist.
//
// THE THREE ARMS. P and E differ in exactly one function, which is the whole
// design of plan.ts ("step 2 is the only part that changes"):
//
//   P  planner        production planContext, Hebrew-aware term overlap
//   E  window-dense   production planContext, cosine similarity over the SAME
//                     windows (gemini-embedding-001 @1536, the shipped recipe)
//   R  corpus-dense   the retrieval subsystem's own shape: the PRODUCTION
//                     chunker's chunks for the shelf's sources, ranked by cosine,
//                     poured into the same budget with no per-file fairness —
//                     because production retrieval has none
//
// P and E run through the real `planContext`, not a copy, for the same reason
// run.mjs imports the real chunker (ingestion standard §5): a harness that scores
// a copy certifies a fiction.
//
// ⚠ WHAT THIS DOES NOT MEASURE, stated because a gate that overstates itself is
// worse than none (M1):
//   · answer QUALITY. It measures whether the anchored passage reached the model.
//   · arm E's windows are NOT the chunker's chunks, so its metadata prefix is
//     rebuilt from what a window has (company, title, the file's own label). The
//     recipe matches production; the inputs are a window's, not a chunk's.
//   · a page-anchored hit is credited when the `[p.N]` marker is in the sent
//     text; a window trimmed by the budget can therefore be credited on its first
//     page. That over-credit is identical in every arm.
//   · class G (discovery) is excluded on purpose: it is market-wide by
//     definition, and a workspace shelf is not the market.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  chunkTranscriptSections,
  chunkFilingPage,
  speakersById,
  transcriptPrefix,
  filingPrefix,
} from '../../src/lib/corpus/chunker.ts'
import { contentToText, fencePart } from '../../src/lib/workspace/chat/context.ts'
import { planContext, windowsOf, estimateTokens, splitBudget } from '../../src/lib/workspace/chat/plan.ts'

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

/**
 * How many files sit on the shelf being asked about.
 *
 * A workspace is a handful of files an analyst pulled together, not an archive —
 * six is the shape the product's own intake produces. It is also the number that
 * makes the comparison hard for the planner in the way a real shelf does: enough
 * distractors that term overlap has somewhere to go wrong, few enough that the
 * budget can still reach every one of them.
 */
const SHELF_SIZE = Number((process.argv.find((a) => a.startsWith('--shelf=')) ?? '--shelf=6').split('=')[1])

/** The route's own arithmetic — see src/app/api/workspaces/[id]/chat/route.ts. */
const PROMPT_BUDGET_TOKENS = 18_000
const PROMPT_OVERHEAD_TOKENS = 900

// ---------------------------------------------------------------- corpus → shelf sources

async function loadSources() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Paged, for run.mjs's reason: Supabase caps unranged selects at 1000 rows, and
  // a gate that silently measured a truncated corpus would report on less than it
  // claims (M1).
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
  const transcripts = await pagedSelect('transcripts', 'id,company_id,youtube_title,formatted_data', ['id'])
  const docs = await pagedSelect('company_documents', 'id,company_id,title', ['id'])
  const pages = await pagedSelect('document_pages', 'document_id,page_no,text', ['document_id', 'page_no'])

  const sources = []
  for (const t of transcripts) {
    const sections = t.formatted_data?.sections ?? []
    const company = companyName[t.company_id] ?? 'ללא שיוך'
    // The SAME flattening the workspace pane and the chat use — a shelf item's
    // text is `contentToText`'s output and nothing else.
    const text = contentToText({ kind: 'transcript', sections })
    if (!text.trim()) continue
    sources.push({
      itemId: `t:${t.id}`,
      srcId: t.id,
      title: t.youtube_title ?? t.id,
      kind: 'transcript',
      company,
      companyId: t.company_id,
      text,
      chunks: chunkTranscriptSections(sections, company, speakersById(t.formatted_data?.speakers)).map(
        (c) => ({
          anchor: { lines: [c.firstLineId, c.lastLineId] },
          content: c.content,
          embInput: c.embeddingInput,
        })
      ),
    })
  }

  const pagesByDoc = new Map()
  for (const p of pages) {
    if (!pagesByDoc.has(p.document_id)) pagesByDoc.set(p.document_id, [])
    pagesByDoc.get(p.document_id).push({ pageNo: p.page_no, text: p.text ?? '' })
  }
  for (const d of docs) {
    const docPages = (pagesByDoc.get(d.id) ?? []).sort((a, b) => a.pageNo - b.pageNo)
    const text = contentToText({ kind: 'document', pages: docPages })
    if (!text.trim()) continue
    const company = companyName[d.company_id] ?? '?'
    const chunks = []
    for (const p of docPages) {
      for (const c of chunkFilingPage(p.text, p.pageNo, company, d.title)) {
        chunks.push({ anchor: { page: p.pageNo }, content: c.content, embInput: c.embeddingInput })
      }
    }
    sources.push({
      itemId: `d:${d.id}`,
      srcId: d.id,
      title: d.title,
      kind: 'document',
      company,
      companyId: d.company_id,
      text,
      chunks,
    })
  }
  return sources
}

// ---------------------------------------------------------------- embeddings (run.mjs's cache)

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
  return { map, file, put: (k, v) => (map.set(k, v), appendFileSync(file, JSON.stringify({ k, v }) + '\n')) }
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

const normalize = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => Number((x / n).toFixed(6)))
}

// gemini-embedding-001 @1536, MRL-truncated and re-normalized — byte for byte the
// recipe src/lib/corpus/embed.ts ships and run.mjs measured. A different recipe
// here would certify nothing.
async function embedGemini(texts, taskType) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const out = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const res = await withRetry(
      async () => {
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              requests: batch.map((text) => ({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text }] },
                taskType,
                outputDimensionality: 1536,
              })),
            }),
          }
        )
        if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`)
        return r.json()
      },
      `gemini batch ${i / 100 + 1}`
    )
    out.push(...res.embeddings.map((e) => normalize(e.values)))
    if (i + 100 < texts.length) await new Promise((r) => setTimeout(r, 200))
  }
  return out
}

const cache = loadCache('gemini')
const embKey = (taskType, t) => sha1(`${taskType} ${t}`)

async function embedAll(texts, taskType) {
  const missing = [...new Set(texts)].filter((t) => !cache.map.has(embKey(taskType, t)))
  if (missing.length) {
    console.log(
      `  embedding ${missing.length} new ${taskType} texts (${texts.length - missing.length} cached)`
    )
    const embs = await embedGemini(missing, taskType)
    missing.forEach((t, i) => cache.put(embKey(taskType, t), embs[i]))
  }
  // A MISSING VECTOR MUST NOT READ AS A LOW SCORE. `cosine` returns 0 for an
  // absent embedding, which is indistinguishable from "this passage does not
  // answer the question" — so a quota error mid-run would quietly hand the
  // planner a win it did not earn, in a gate whose whole job is to be able to say
  // the planner won. Refuse to score instead (M3.3).
  const absent = [...new Set(texts)].filter((t) => !cache.map.has(embKey(taskType, t)))
  if (absent.length)
    throw new Error(`${absent.length} ${taskType} texts have no embedding — refusing to score`)
  return (t) => {
    const v = cache.map.get(embKey(taskType, t))
    if (!v) throw new Error(`no ${taskType} embedding for a text the run is scoring`)
    return v
  }
}

const cosine = (a, b) => {
  if (!a || !b) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// ---------------------------------------------------------------- shelves and scoring

const casesFile = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'))

/** The eval anchors, resolved to the shelf items that hold them. */
function anchorSources(anchors, byId) {
  const out = []
  for (const a of anchors ?? []) {
    const id = a.transcript ? `t:${a.transcript}` : `d:${a.document}`
    const source = byId.get(id)
    if (!source) return null // an anchor whose source is gone is a corpus fact, reported not scored
    out.push({ source, anchor: a })
  }
  return out
}

/**
 * What arm E embeds for one window — the SAME deterministic metadata prefix
 * production puts in front of a chunk.
 *
 * The first run embedded raw window text, and that is a handicap on precisely
 * the arm the ticket defines as "the swap": production embeds
 * `{company} · {title} · עמ' {N}:\n{body}`, the prefix is a measured part of the
 * recipe, and `run.mjs` keeps a `B-gemini-nopfx` ablation for what dropping it
 * costs. Comparing a prefixed planner-replacement against an unprefixed one is
 * not the comparison the ticket asked for. A window is not a chunk, so the
 * prefix is built from what a window HAS — the source's company and title, and
 * the label the file gave the window.
 */
function windowEmbInput(source, w) {
  if (source.kind === 'transcript') return transcriptPrefix(source.company, w.label, []) + w.text
  // THE PAGE AND THE PART ARE READ SEPARATELY, and this is not fussiness. A long
  // page becomes two windows labelled `p.14 (1/2)`, and digit-stripping that
  // whole label gives 1412 — so every split filing page was being embedded under
  // `עמ' 1412`, a page number that does not exist, on the arm the verdict is
  // about. It is the SAME class as the raw-text handicap this harness already
  // fixed once: a wrong prefix invented by the harness, not by the design.
  const m = w.label.match(/p\.(\d+)(?:\s*\((\d+)\/\d+\))?/)
  const pageNo = m ? Number(m[1]) : 0
  const partNo = m && m[2] ? Number(m[2]) : null
  return filingPrefix(source.company, source.title, pageNo, partNo) + w.text
}

/**
 * A realistic shelf: every anchored file, then the analyst's likely neighbours.
 *
 * Same-company files first because that is what an analyst actually pulls
 * together, then other companies in id order so the choice is deterministic and
 * identical across arms. The distractors are the point: with only the anchored
 * file on the shelf, every arm scores 100% and the gate measures nothing.
 */
function buildShelf(anchored, allSources) {
  const shelf = []
  const seen = new Set()
  const add = (s) => {
    if (!seen.has(s.itemId)) (seen.add(s.itemId), shelf.push(s))
  }
  for (const { source } of anchored) add(source)
  const companies = new Set(anchored.map(({ source }) => source.companyId))
  const rest = allSources
    .filter((s) => !seen.has(s.itemId))
    .sort(
      (a, b) =>
        Number(companies.has(b.companyId)) - Number(companies.has(a.companyId)) ||
        a.itemId.localeCompare(b.itemId)
    )
  for (const s of rest) {
    if (shelf.length >= SHELF_SIZE) break
    add(s)
  }
  return shelf
}

/**
 * Split a planner's output back into what was sent FOR EACH item.
 *
 * ATTRIBUTION IS BY MEMBERSHIP IN A KNOWN SET, never by parsing the header. An
 * earlier version read the id back out with `/id: ([^)]+)\)/` — a regex over a
 * line that also carries a title nobody controls, in a gate whose whole job is
 * to be able to say the planner won. A silent misattribution there would move
 * scores with nothing to show for it. The shelf's ids are known here, so the
 * question "whose section is this" is answered by asking each of them.
 */
function sentPerItem(text, shelf) {
  const out = new Map()
  for (const part of text.split('<<<ATLAS-SOURCE').slice(1)) {
    // STARTS-WITH THE WHOLE RECONSTRUCTED HEAD, not "contains the id somewhere".
    // A substring match is still a proxy: a title carrying another shelf item's
    // `id: t:…)` would misattribute. Rebuilding each source's exact header and
    // anchoring at position 0 removes the guess — and a title cannot forge one,
    // because `fencePart` has already defanged the marker this split runs on.
    const owner = shelf.find((s) =>
      part.startsWith(` ${fencePart(s.title)} (${fencePart(s.kind)}, id: ${fencePart(s.itemId)})`)
    )
    if (owner) out.set(owner.itemId, (out.get(owner.itemId) ?? '') + part)
  }
  return out
}

/** Did the sent text carry this anchor? */
function covers(sent, anchor) {
  if (!sent) return false
  if (anchor.lines) return anchor.lines.every((l) => sent.includes(`[${l}]`))
  return sent.includes(`[p.${anchor.page}]`)
}

/**
 * Arm R — the retrieval subsystem's own shape.
 *
 * Production chunks, ranked by cosine, poured into the same budget until it is
 * spent. NO per-file fairness ration, because `retrieveChunks` has none: giving
 * it the planner's fairness rule would measure a design nobody proposed.
 */
function planByChunks(shelf, queryVec, vecOf, budgetTokens, fair = false) {
  const outline = shelf
    .map((s) => `- ${s.title} (${s.kind}, id: ${s.itemId}) — ${s.chunks.length} chunks`)
    .join('\n')
  let spent = estimateTokens(outline)
  let ranked = shelf
    .flatMap((s) =>
      s.chunks.map((c) => ({ source: s, chunk: c, score: cosine(queryVec, vecOf(c.embInput)) }))
    )
    .sort((a, b) => b.score - a.score)

  // Arm F: the planner's fairness rule applied to the retrieval subsystem's
  // chunks — one chunk from each file before a second from any. It is the one
  // thing arm R gives up that plan.ts was built around, and on this shelf a
  // 175-page annual report gets 175 chances to outrank a 21-chunk call.
  if (fair) {
    const first = []
    const rest = []
    const seen = new Set()
    for (const r of ranked) {
      if (seen.has(r.source.itemId)) rest.push(r)
      else {
        seen.add(r.source.itemId)
        first.push(r)
      }
    }
    ranked = [...first, ...rest]
  }

  const per = new Map()
  for (const r of ranked) {
    const marker = r.chunk.anchor.page
      ? `[p.${r.chunk.anchor.page}]`
      : r.chunk.anchor.lines.map((l) => `[${l}]`).join(' ')
    // THE MARKER IS CHARGED. Arms P and E pay for their `[label]` lines inside
    // planContext, so leaving R's free handed the challenger a slightly bigger
    // budget than the planner. It is a bias in the LOSER's favour and so never
    // threatened the verdict — which is exactly why it had to be fixed rather
    // than argued away.
    const cost = estimateTokens(marker + '\n' + r.chunk.content)
    if (spent + cost > budgetTokens) continue
    spent += cost
    per.set(r.source.itemId, (per.get(r.source.itemId) ?? '') + marker + '\n' + r.chunk.content + '\n')
  }
  return per
}

/**
 * A transcript chunk spans a RANGE of lines; the eval anchors a single one.
 *
 * Arm R's markers name only the range ends, so `covers` — written for the
 * planner's verbatim `[L0008]` text — would miss an anchor sitting inside a
 * chunk. Expanding the range is not generosity; it is what "the anchored source
 * is in what it retrieves" means for a chunk.
 */
function expandRanges(text) {
  return text.replace(/\[L(\d+)\] \[L(\d+)\]/g, (_, a, b) => {
    const ids = []
    for (let i = Number(a); i <= Number(b); i++) ids.push(`[L${String(i).padStart(4, '0')}]`)
    return ids.join(' ')
  })
}

// ---------------------------------------------------------------- the run

async function main() {
  console.log('Loading the corpus as workspace shelf items…')
  const sources = await loadSources()
  const byId = new Map(sources.map((s) => [s.itemId, s]))
  console.log(
    `  ${sources.length} shelf-able items (${sources.filter((s) => s.kind === 'transcript').length} transcripts)`
  )

  // Only cases with a resolvable anchor. 13/14 are resolver cases (no passage to
  // retrieve), 17 is the negative case (nothing to find), 19/20 are market-wide.
  const cases = []
  const skipped = []
  for (const c of casesFile.cases) {
    if (c.mode === 'discovery') {
      skipped.push([c.id, 'class G — market-wide by definition; a shelf is not the market'])
      continue
    }
    if (!c.anchors?.length) {
      skipped.push([c.id, 'no anchor to retrieve (resolver or negative case)'])
      continue
    }
    const anchored = anchorSources(c.anchors, byId)
    if (!anchored) {
      skipped.push([c.id, 'an anchored source is not in the corpus today'])
      continue
    }
    cases.push({ ...c, anchored })
  }
  console.log(`  ${cases.length} scoreable cases, ${skipped.length} skipped`)

  const shelves = cases.map((c) => buildShelf(c.anchored, sources))

  // Embed once, for every arm, through the cache.
  const windowTexts = []
  const chunkTexts = []
  for (const shelf of shelves) {
    for (const s of shelf) {
      for (const w of windowsOf(s.text)) windowTexts.push(windowEmbInput(s, w))
      for (const ch of s.chunks) chunkTexts.push(ch.embInput)
    }
  }
  const docVec = await embedAll([...windowTexts, ...chunkTexts], 'RETRIEVAL_DOCUMENT')
  const queryVec = await embedAll(
    cases.map((c) => c.query),
    'RETRIEVAL_QUERY'
  )

  const rows = []
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const shelf = shelves[i]
    const qv = queryVec(c.query)

    // THE SAME BUDGET, computed the way the route computes it.
    const budget = splitBudget({
      totalTokens: PROMPT_BUDGET_TOKENS,
      overheadTokens: estimateTokens(c.query) + PROMPT_OVERHEAD_TOKENS,
    })

    const planP = planContext({ question: c.query, sources: shelf, budgetTokens: budget.sources })
    const planE = planContext({
      question: c.query,
      sources: shelf,
      budgetTokens: budget.sources,
      scoreWindow: (w, s) => cosine(qv, docVec(windowEmbInput(s, w))),
    })
    const sentP = sentPerItem(planP.text, shelf)
    const sentE = sentPerItem(planE.text, shelf)
    const sentR = planByChunks(shelf, qv, docVec, budget.sources)
    const sentF = planByChunks(shelf, qv, docVec, budget.sources, true)

    const score = (sent, expand) =>
      c.anchored.every(({ source, anchor }) =>
        covers(expand ? expandRanges(sent.get(source.itemId) ?? '') : sent.get(source.itemId), anchor)
      )

    rows.push({
      id: c.id,
      class: c.class,
      wart: c.wart ?? '',
      query: c.query,
      shelf: shelf.length,
      anchors: c.anchored.map(
        ({ source, anchor }) => `${source.title} · ${anchor.lines?.join('–') ?? `p.${anchor.page}`}`
      ),
      P: score(sentP, false),
      E: score(sentE, false),
      R: score(sentR, true),
      F: score(sentF, true),
      tokensP: planP.tokens,
      tokensE: planE.tokens,
      // Per-item spend, for eyeballing a miss: WHICH file the budget went to is
      // usually the answer, and a pass/fail column cannot show it.
      spread: shelf.map((s) => ({
        title: s.title.slice(0, 40),
        kind: s.kind,
        anchored: c.anchored.some(({ source }) => source.itemId === s.itemId),
        windows: windowsOf(s.text).length,
        chunks: s.chunks.length,
        readP: planP.sources.find((x) => x.itemId === s.itemId)?.read ?? 0,
        readE: planE.sources.find((x) => x.itemId === s.itemId)?.read ?? 0,
        readR: (sentR.get(s.itemId)?.match(/\n/g) ?? []).length,
      })),
    })
    console.log(
      `  case ${c.id}  P ${rows.at(-1).P ? '✓' : '✗'}  E ${rows.at(-1).E ? '✓' : '✗'}  R ${rows.at(-1).R ? '✓' : '✗'}  F ${rows.at(-1).F ? '✓' : '✗'}`
    )
  }

  const tally = (k) => rows.filter((r) => r[k]).length
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const md = [
    `# B3 gate — workspace planner vs the new retrieval`,
    ``,
    `Run: ${stamp} · shelf size ${SHELF_SIZE} · budget ${PROMPT_BUDGET_TOKENS} tokens (the route's own)`,
    ``,
    `| arm | what it is | cases passed |`,
    `| --- | --- | --- |`,
    `| **P** | planner — production \`planContext\`, term overlap | **${tally('P')} / ${rows.length}** |`,
    `| **E** | production \`planContext\`, cosine over the SAME windows | **${tally('E')} / ${rows.length}** |`,
    `| **R** | production chunks, cosine, no fairness ration | **${tally('R')} / ${rows.length}** |`,
    `| **F** | production chunks, cosine, WITH the planner's fairness ration | **${tally('F')} / ${rows.length}** |`,
    ``,
    `| case | class | wart | P | E | R | F | anchors | shelf |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.class} | ${r.wart} | ${r.P ? '✓' : '✗'} | ${r.E ? '✓' : '✗'} | ${r.R ? '✓' : '✗'} | ${r.F ? '✓' : '✗'} | ${r.anchors.join('; ')} | ${r.shelf} |`
    ),
    ``,
    `## Skipped, and why`,
    ``,
    ...skipped.map(([id, why]) => `- case ${id} — ${why}`),
    ``,
    `## Questions asked`,
    ``,
    ...rows.map((r) => `- **${r.id}** — ${r.query}`),
  ].join('\n')

  const out = join(RESULTS, `workspace-gate-${stamp}.md`)
  writeFileSync(out, md)
  writeFileSync(join(RESULTS, `workspace-gate-${stamp}.json`), JSON.stringify({ rows, skipped }, null, 2))
  console.log(
    `\nP ${tally('P')}/${rows.length}  ·  E ${tally('E')}/${rows.length}  ·  R ${tally('R')}/${rows.length}  ·  F ${tally('F')}/${rows.length}`
  )
  console.log(`→ ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
