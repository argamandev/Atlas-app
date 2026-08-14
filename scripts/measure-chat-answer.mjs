// ─────────────────────────────────────────────────────────────────────────────
// PRICE ONE REAL ANSWER, AND WATCH THE TOOL LOOP RUN AGAINST THE REAL CORPUS.
//
// Ticket 07 names three measurements as its OUTPUT, not as a side effect: does
// the tool loop behave against the real ~98K-chunk corpus, what does an answer
// actually cost against the $0.06 budget, and does Railway's ANTHROPIC_API_KEY
// work. This script is the first two. The third needs a deploy and is a founder
// step — a local key proves the LOCAL key and nothing else (app.md M1).
//
// It touches NO production code path: the Anthropic client is wrapped so every
// `messages.create` response's `usage` block is recorded on the way past.
// `runChatLoop` is driven exactly as the route drives it, with the real handlers
// over the real Supabase corpus, so what is measured is the thing that ships.
//
// USAGE: node --import tsx scripts/measure-chat-answer.mjs "your question here"
//        (add --company <uuid> to measure the pinpoint path)
//
// It prints token counts, a price, and the event trace. It never prints a key.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
// `.env.local` into the environment, matching `scripts/anthropic-verify.mjs`.
// The real tool handlers need the Supabase vars too — the whole point is to
// exercise the REAL corpus, not a stub of it. Values are never printed.
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const { runChatLoop } = await import('../src/lib/chat2/loop.ts')
const { israelDayKey } = await import('../src/lib/i18n/format.ts')

// Sonnet 5 list price, USD per million tokens. Stated here rather than imported
// so a pricing change is a visible edit to the thing that computes the number.
const USD_PER_MTOK_IN = 3
const USD_PER_MTOK_OUT = 15
const USD_PER_MTOK_CACHE_READ = 0.3
const BUDGET_USD = 0.06

const args = process.argv.slice(2)
const companyFlag = args.indexOf('--company')
const companyId = companyFlag !== -1 ? args[companyFlag + 1] : undefined
const question = args
  // `companyFlag + 1` is 0 when the flag is ABSENT, so this ate the first word of
  // every unscoped question and then reported only "usage" — the arg parser
  // dropping the one argument it exists to keep.
  .filter((_, i) => companyFlag === -1 || (i !== companyFlag && i !== companyFlag + 1))
  .join(' ')
  .trim()

if (!question) {
  console.error('usage: node --import tsx scripts/measure-chat-answer.mjs "question" [--company <uuid>]')
  process.exit(2)
}

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set locally — nothing to measure.')
  process.exit(2)
}

const real = new Anthropic({ apiKey })
const usages = []

/** The route's client, with a tap on the way past. Nothing else differs. */
const client = {
  messages: {
    async create(body) {
      const started = Date.now()
      const res = await real.messages.create(body)
      usages.push({ ...res.usage, ms: Date.now() - started, stop: res.stop_reason })
      return res
    },
  },
}

const events = []
let answer = ''
const t0 = Date.now()

for await (const e of runChatLoop({
  client,
  scope: { userId: 'measurement', companyId: companyId ?? null },
  history: [],
  message: question,
  todayIsrael: israelDayKey(new Date()),
  scopeSummary: companyId ? `company: ${companyId} (resolved)` : undefined,
})) {
  events.push(e)
  if (e.type === 'delta') answer += e.text
}

const wallMs = Date.now() - t0
const sum = (k) => usages.reduce((n, u) => n + (u[k] ?? 0), 0)
const inTok = sum('input_tokens')
const outTok = sum('output_tokens')
const cacheRead = sum('cache_read_input_tokens')
const cacheWrite = sum('cache_creation_input_tokens')

const cost =
  (inTok / 1e6) * USD_PER_MTOK_IN +
  (outTok / 1e6) * USD_PER_MTOK_OUT +
  (cacheRead / 1e6) * USD_PER_MTOK_CACHE_READ

const terminal = events.at(-1)

console.log('\n─── QUESTION ───')
console.log(question, companyId ? `\n(scoped to ${companyId})` : '\n(unscoped — search mode)')

console.log('\n─── EVENT TRACE ───')
for (const e of events) {
  if (e.type === 'delta') continue
  console.log(' ', JSON.stringify(e))
}
console.log(`  (${events.filter((e) => e.type === 'delta').length} delta events, ${answer.length} chars)`)

console.log('\n─── ANSWER ───')
console.log(answer || '(no answer text)')

console.log('\n─── COST ───')
console.log(`  round-trips     ${usages.length}`)
console.log(`  input tokens    ${inTok}`)
console.log(`  output tokens   ${outTok}`)
console.log(`  cache read      ${cacheRead}`)
console.log(`  cache write     ${cacheWrite}`)
console.log(`  wall clock      ${(wallMs / 1000).toFixed(1)}s`)
console.log(`  COST            $${cost.toFixed(4)}`)
console.log(`  BUDGET          $${BUDGET_USD.toFixed(2)} — ${cost <= BUDGET_USD ? 'WITHIN' : 'OVER'}`)
console.log(`  terminal        ${terminal?.type}${terminal?.code ? ` (${terminal.code})` : ''}`)

// A cost measurement whose turn ended incomplete priced a DIFFERENT thing than
// "an answer" — say so rather than letting the number stand unqualified.
if (terminal?.type !== 'done') {
  console.log('\n  ⚠ This turn did not end cleanly, so the figure prices a degraded turn, not an answer.')
}
