#!/usr/bin/env node
// scripts/llm-correct-spike.mjs
//
// Multi-model correction spike. Same verbatim prompt sent to every model.
//
// Subcommands:
//   gemini-models                      List Gemini models
//   fetch <transcriptId>               Pull raw_transcript from Supabase
//   gemini <modelId> <inputFile>       Run Gemini  → fixtures/<slug>-<base>.txt
//   claude <modelId> <inputFile>       Run Claude  → fixtures/<slug>-<base>.txt
//   gpt    <modelId> <inputFile>       Run GPT     → fixtures/<slug>-<base>.txt
//   push   <label>   <inputFile>       Parse markdown → Supabase row
//   measure <candidateFile> <goldFile> <baselineFile>   Score vs gold

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FIX = join(__dirname, 'fixtures')

// --- tiny .env loader (names only, never prints values) ---
function loadEnv(file) {
  const p = join(ROOT, file)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv('.env.local')
loadEnv('.env')

// ---- PROMPTS ----
const PROMPT_V1 = `The text below is a raw IVRIT speech-to-text with no speaker labels. The speaker names are already in the text.

your mission is to understand the context of the call, organize it beautifully with speaker names, paragraphs of each speaker and fix specific typos or wrong words based on the context you understand.

This is an investors call transcript - meaning it's very important you dont "guess" the fix to a typo and you don't change the number of words in the raw transcript.

Don't rephrase and dont summorize!



Just organize everything, fix specific words!`

const PROMPT_V2 = `The text below is a raw IVRIT speech-to-text with no speaker labels. The speaker names are already in the text.

your mission is to understand the context of the call, organize it beautifully with speaker names, paragraphs of each speaker and fix specific typos or wrong words based on the context you understand.

This is an investors call transcript -of a company called "אמפא" which is an Israeli Real Estate company. It's very important you dont "guess" the fix to a typo and you don't change the number of words in the raw transcript.

Don't rephrase and dont summorize!

Just organize everything, fix specific words you are confident they are wrong based on the context!`

const GEMINI_KEY = process.env.GEMINI_API_KEY
const CLAUDE_KEY = process.env.CLAUDE_API_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY

// Pass --v2 as last arg to use PROMPT_V2
const USE_V2 = process.argv.includes('--v2')
const PROMPT = USE_V2 ? PROMPT_V2 : PROMPT_V1

function buildUserContent(rawText) {
  return `${PROMPT}\n\n${rawText}`
}

// Slug a model ID into a safe filename prefix
function modelSlug(model) {
  return model.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase()
}

function outPath(model, inputFile) {
  const base = basename(inputFile).replace(/^ivrit-/, '').replace(/\.txt$/, '')
  const suffix = USE_V2 ? '-v2' : ''
  return join(FIX, `${modelSlug(model)}${suffix}-${base}.txt`)
}

// ---------- gemini-models ----------
async function listGeminiModels() {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}&pageSize=200`
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`models list failed (${res.status}): ${JSON.stringify(json.error ?? json)}`)
  const gen = (json.models ?? []).filter(m =>
    (m.supportedGenerationMethods ?? []).includes('generateContent')
  )
  console.log(`\n${gen.length} models support generateContent. Flash variants:\n`)
  for (const m of gen) {
    const name = m.name.replace(/^models\//, '')
    if (/flash/i.test(name)) console.log(`  ${name}   (${m.displayName ?? ''})`)
  }
  console.log('\nAll generateContent models:\n')
  for (const m of gen) console.log(`  ${m.name.replace(/^models\//, '')}`)
}

// ---------- fetch raw IVRIT from Supabase ----------
async function fetchRaw(id) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { fetch: (i, init = {}) => fetch(i, { ...init, cache: 'no-store' }) } }
  )
  const { data, error } = await supa
    .from('transcripts')
    .select('id, status, raw_transcript')
    .like('id', `${id}%`)
  if (error) throw new Error(`Supabase: ${error.message}`)
  const rows = (data ?? []).filter(r => r.raw_transcript && r.raw_transcript.length > 0)
  if (rows.length === 0) throw new Error(`No row with raw_transcript for id like "${id}%"`)
  rows.sort((a, b) => b.raw_transcript.length - a.raw_transcript.length)
  const row = rows[0]
  const out = join(FIX, `ivrit-${id}.txt`)
  writeFileSync(out, row.raw_transcript, 'utf8')
  console.log(`row id=${row.id}  status=${row.status}`)
  console.log(`raw_transcript: ${row.raw_transcript.length} chars`)
  console.log(`saved -> ${out}`)
}

// ---------- gemini run ----------
async function runGemini(model, inputFile) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set')
  const rawText = readFileSync(inputFile, 'utf8')
  const out = outPath(model, inputFile)
  console.log(`[gemini] model=${model}  input=${basename(inputFile)} (${rawText.length} chars)`)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildUserContent(rawText) }] }],
        generationConfig: { maxOutputTokens: 65536, temperature: 1 },
      }),
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`gemini failed (${res.status}): ${JSON.stringify(json.error ?? json)}`)
  const cand = json.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('')
  console.log(`[gemini] finishReason=${cand?.finishReason}  usage=${JSON.stringify(json.usageMetadata ?? {})}`)
  if (!text) throw new Error(`gemini returned no text: ${JSON.stringify(json).slice(0, 500)}`)
  writeFileSync(out, text, 'utf8')
  console.log(`[gemini] ${text.length} chars -> ${out}`)
}

// ---------- claude run (no thinking) ----------
async function runClaude(model, inputFile) {
  if (!CLAUDE_KEY) throw new Error('CLAUDE_API_KEY not set')
  const rawText = readFileSync(inputFile, 'utf8')
  const out = outPath(model, inputFile)
  console.log(`[claude] model=${model}  input=${basename(inputFile)} (${rawText.length} chars)`)
  const anthropic = new Anthropic({ apiKey: CLAUDE_KEY })
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 16000,
    messages: [{ role: 'user', content: buildUserContent(rawText) }],
  })
  const final = await stream.finalMessage()
  const text = final.content.filter(b => b.type === 'text').map(b => b.text).join('')
  console.log(`[claude] stop=${final.stop_reason}  usage=${JSON.stringify(final.usage)}`)
  if (!text) throw new Error(`claude returned no text: ${JSON.stringify(final.content).slice(0, 500)}`)
  writeFileSync(out, text, 'utf8')
  console.log(`[claude] ${text.length} chars -> ${out}`)
}

// ---------- gpt run ----------
async function runGPT(model, inputFile) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set')
  const rawText = readFileSync(inputFile, 'utf8')
  const out = outPath(model, inputFile)
  console.log(`[gpt] model=${model}  input=${basename(inputFile)} (${rawText.length} chars)`)
  const openai = new OpenAI({ apiKey: OPENAI_KEY })
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: buildUserContent(rawText) }],
    max_completion_tokens: 16000,
  })
  const text = response.choices[0]?.message?.content ?? ''
  console.log(`[gpt] finish=${response.choices[0]?.finish_reason}  usage=${JSON.stringify(response.usage)}`)
  if (!text) throw new Error(`gpt returned no text`)
  writeFileSync(out, text, 'utf8')
  console.log(`[gpt] ${text.length} chars -> ${out}`)
}

// ---------- measure (port of measure-core.ts logic) ----------
function normalize(text) {
  return text
    .replace(/^[\s\S]*?(?=\[\d{2}:\d{2}:\d{2}\])/, '')
    .replace(/\[\d{2}:\d{2}:\d{2}\]/g, ' ')
    .replace(/^#{1,6}.*$/gm, ' ')
    .replace(/^=+$/gm, ' ')
    .replace(/^[^\n:]{1,40}:\s*$/gm, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'״׳‘’“”]/g, '')
    .replace(/[.,!?;:()\[\]{}<>\-–—…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean)
}

function lcsGoldMatched(cand, gold) {
  const n = cand.length, m = gold.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cand[i] === gold[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
  const matched = new Array(m).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (cand[i] === gold[j]) { matched[j] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return matched
}

// Returns matched[i]=true for each CANDIDATE token that is in the LCS (correct vs gold)
function lcsCandMatched(cand, gold) {
  const n = cand.length, m = gold.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cand[i] === gold[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
  const matched = new Array(n).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (cand[i] === gold[j]) { matched[i] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return matched
}

async function measure(candidateFile, goldFile, baselineFile) {
  const gold = readFileSync(goldFile, 'utf8')
  const candidate = readFileSync(candidateFile, 'utf8')
  const baseline = readFileSync(baselineFile, 'utf8')

  const g = tokenize(gold)
  const gb = lcsGoldMatched(tokenize(baseline), g)
  const gc = lcsGoldMatched(tokenize(candidate), g)

  let fixed = 0, introduced = 0, remaining = 0, baselineErrors = 0, candidateErrors = 0
  for (let k = 0; k < g.length; k++) {
    if (!gb[k]) baselineErrors++
    if (!gc[k]) { candidateErrors++; remaining++ }
    if (!gb[k] && gc[k]) fixed++
    if (gb[k] && !gc[k]) introduced++
  }

  const label = basename(candidateFile).replace(/\.txt$/, '')
  console.log(`\n── ${label} ──`)
  console.log(`  baseline errors : ${baselineErrors} / ${g.length} tokens  (${(baselineErrors/g.length*100).toFixed(1)}%)`)
  console.log(`  candidate errors: ${candidateErrors} / ${g.length} tokens  (${(candidateErrors/g.length*100).toFixed(1)}%)`)
  console.log(`  fixed           : ${fixed}`)
  console.log(`  introduced      : ${introduced}`)
  console.log(`  remaining       : ${remaining}`)
  console.log(`  net improvement : ${fixed - introduced > 0 ? '+' : ''}${fixed - introduced}`)
}

// ---------- push to Supabase (parse markdown → formatted_data) ----------
// goldFile: optional — if provided, words that don't match gold are flagged yellow
async function pushToSite(label, inputFile, goldFile) {
  const text = readFileSync(inputFile, 'utf8')

  // Auto-detect company metadata from filename
  const isAmpa = basename(inputFile).includes('ampa')
  const videoId = isAmpa ? 'hYaQQaDe5CU' : 'BkBi6pGLyUc'
  const company = isAmpa ? 'אמפא' : 'קוואליטו'
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { fetch: (i, init = {}) => fetch(i, { ...init, cache: 'no-store' }) } }
  )

  const speakerMap = {}
  const sections = []
  let sectionIdx = 0
  let lineIdx = 0

  function getSpeaker(displayName) {
    if (speakerMap[displayName]) return speakerMap[displayName]
    const id = `spk_${Object.keys(speakerMap).length + 1}`
    let role = 'analyst'
    if (/מנכ/.test(displayName)) role = 'ceo'
    else if (/כספ|cfo|פיננס/.test(displayName)) role = 'cfo'
    else if (/שירן|מנח|מארח/.test(displayName)) role = 'moderator'
    const spk = { id, name: displayName, role, title: displayName }
    speakerMap[displayName] = spk
    return spk
  }

  // Split on both "## Name" and "**Name:**" speaker headers
  const parts = text.split(/(?=^(?:#{2,3}\s|\*\*[^\n*]+\*\*:?\s*$))/m)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // Match "## Name" or "**Name:**" (both with optional trailing colon/asterisks)
    const headerMatch = trimmed.match(/^(?:#{2,3}\s+\*{0,2}([^*\n#]+)\*{0,2}|\*\*([^*\n]+?)\*\*:?)/)
    if (!headerMatch) continue
    const speakerDisplay = (headerMatch[1] ?? headerMatch[2])?.trim().replace(/:$/, '')
    if (!speakerDisplay) continue
    const spk = getSpeaker(speakerDisplay)
    const afterHeader = trimmed.slice(headerMatch[0].length)
    const content = afterHeader.replace(/\n---+\n/g, '\n\n').trim()
    const paragraphs = content
      .split(/\n\n+/)
      .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(p => p && p !== '---' && !/^#{1,3}/.test(p))
    if (paragraphs.length === 0) continue
    const lines = paragraphs.map(p => ({
      id: `line_${++lineIdx}`,
      speakerId: spk.id,
      timestamp: '',
      text: p,
    }))
    sections.push({ id: `sec_${++sectionIdx}`, title: speakerDisplay, lines })
  }

  // --- typo flagging: compare every token in the output against gold ---
  if (goldFile && existsSync(goldFile)) {
    const goldTokens = tokenize(readFileSync(goldFile, 'utf8'))
    // Build flat list of { token, line } preserving order
    const candWithLines = []
    for (const sec of sections)
      for (const line of sec.lines)
        for (const tok of tokenize(line.text))
          candWithLines.push({ token: tok, line })

    const matched = lcsCandMatched(candWithLines.map(x => x.token), goldTokens)
    for (let i = 0; i < candWithLines.length; i++) {
      if (!matched[i]) {
        const { token, line } = candWithLines[i]
        if (!line.flags) line.flags = []
        if (!line.flags.some(f => f.text === token))
          line.flags.push({ text: token, reason: 'מילה שאינה תואמת לתמלול הסופי — בדוק בהקלטה' })
      }
    }
    const flagCount = sections.reduce((n, s) => n + s.lines.reduce((m, l) => m + (l.flags?.length ?? 0), 0), 0)
    console.log(`[push] flagged ${flagCount} suspect words (vs gold)`)
  }

  const speakers = Object.values(speakerMap)
  const rowId = `${videoId}_${label}`
  const formattedData = {
    id: rowId,
    company,
    quarter: 'Q1 2026',
    date: '2026',
    duration: '',
    youtubeUrl,
    status: 'completed',
    createdAt: new Date().toISOString(),
    engine: 'ivrit',
    model: `${label}-corrected`,
    speakers,
    sections,
  }

  const { error } = await supa.from('transcripts').upsert({
    id: rowId,
    youtube_url: youtubeUrl,
    status: 'completed',
    formatted_data: formattedData,
    processing_step: null,
  }, { onConflict: 'id' })

  if (error) throw new Error(`Supabase upsert: ${error.message}`)
  const totalLines = sections.reduce((n, s) => n + s.lines.length, 0)
  console.log(`[push] ${label}: ${speakers.length} speakers, ${sections.length} sections, ${totalLines} lines`)
  console.log(`[push] row id: ${rowId}`)
  console.log(`[push] view at: /transcript/${rowId}`)
}

// ---------- main ----------
const [cmd, a, b, c, d] = process.argv.slice(2).filter(x => !x.startsWith('--'))
try {
  if (cmd === 'gemini-models') await listGeminiModels()
  else if (cmd === 'fetch') await fetchRaw(a)
  else if (cmd === 'gemini') await runGemini(a, b)
  else if (cmd === 'claude') await runClaude(a, b)
  else if (cmd === 'gpt') await runGPT(a, b)
  else if (cmd === 'push') await pushToSite(a, b, c)
  else if (cmd === 'measure') await measure(a, b, c)
  else {
    console.error('Usage: gemini-models | fetch <id> | gemini <model> <file> | claude <model> <file> | gpt <model> <file> | push <label> <file> [goldFile] | measure <candidate> <gold> <baseline>')
    process.exit(1)
  }
} catch (e) {
  console.error('ERROR:', e.message)
  process.exit(1)
}
