// Ticket 11 — verify the Anthropic API key with one metered call and record
// the org's rate-limit tier + a Hebrew token re-baseline.
//
// Run:  node scripts/anthropic-verify.mjs
// Reads ANTHROPIC_API_KEY from the environment or .env.local. Writes a
// results file (NO secrets) to .scratch/smart-layer/research/11-key-verification.md.

import fs from 'node:fs'
import path from 'node:path'

const RESULTS_PATH = path.join(process.cwd(), '.scratch', 'smart-layer', 'research', '11-key-verification.md')

// Sonnet 5 is the founder-approved default brain for every Atlas surface
// (ticket 08), so the tier that matters is the claude-sonnet-5 bucket.
const MODEL = 'claude-sonnet-5'
const API = 'https://api.anthropic.com/v1'

// Real founder-approved eval questions (docs/eval/retrieval-eval-set.md) —
// representative Hebrew chat input for the chars-per-token re-baseline.
const HEBREW_SAMPLE = [
  'מה היו ההכנסות של קבוצת תיגבור בשנת 2025 ובכמה הן צמחו?',
  'מה היה הרווח התפעולי, הרווח הנקי וה-EBITDA של תיגבור ב-2025?',
  'מה מדיניות הדיבידנד של תיגבור?',
  'מה היו התוצאות של תיגבור ברבעון הראשון של 2026?',
  'כמה גייסה תיגבור לאחרונה ולאיזו מטרה?',
  'כמה עובדים מעסיקה קבוצת תיגבור?',
  'כמה מגה-וואט בהפעלה מסחרית יש לדוראל אנרגיה?',
  'מה היה הרווח הנקי של יעקב פיננסים במחצית הראשונה של 2026?',
  'מה כושר הזיקוק השנתי של בז"ן?',
  'האם ההכנסות שהציגה תיגבור בשיחת הרבעון הראשון 2026 תואמות את הדוח הרבעוני?',
  'כמה עובדים של תיגבור נמצאים במילואים ואיך זה השתנה?',
  'באילו מכרזי אבטחה חדשים זכתה תיגבור ולכמה זמן?',
  'מה המרווח האחרון של בז"א?',
  'מה אמרה הנהלת תיגבור על מכירת צים?',
  'כמה אוניות של צים יישארו בבעלות ישראלית לפי הדיון בכנסת?',
  'מה היה הרווח הנקי של טבע ב-2025?',
].join(' ')

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^ANTHROPIC_API_KEY=(.*)$/)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}

function ratelimitHeaders(res) {
  const out = {}
  for (const [k, v] of res.headers.entries()) {
    if (k.startsWith('anthropic-ratelimit')) out[k] = v
  }
  return out
}

// Tier guess from the requests-per-minute limit, per the verified table in
// .scratch/smart-layer/research/02-agent-sdk.md §8 (Sonnet 5 bucket).
function guessTier(rpm) {
  if (!rpm) return 'unknown (no requests-limit header)'
  const n = Number(rpm)
  if (n >= 10000) return 'Scale (or custom)'
  if (n >= 5000) return 'Build'
  if (n >= 1000) return 'Start'
  return `Evaluation / below Start (${n} RPM)`
}

async function main() {
  const key = loadKey()
  if (!key) {
    console.error('✗ No ANTHROPIC_API_KEY in environment or .env.local — run the wizard first.')
    process.exit(1)
  }
  const headers = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }

  // 1 — one metered call (a few dozen tokens; fractions of a cent).
  console.log(`→ metered test call to ${MODEL} …`)
  const msgRes = await fetch(`${API}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 64,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'ענה במילה אחת בלבד: מה בירת צרפת?' }],
    }),
  })
  const msgBody = await msgRes.json()
  if (!msgRes.ok) {
    console.error(`✗ API call failed (HTTP ${msgRes.status}):`, JSON.stringify(msgBody, null, 2))
    process.exit(1)
  }
  const limits = ratelimitHeaders(msgRes)
  const answer = (msgBody.content?.[0]?.text ?? '').trim()
  console.log(`✓ key works — model answered: "${answer}" (stop_reason: ${msgBody.stop_reason})`)

  // 2 — Hebrew token re-baseline via count_tokens (free endpoint).
  console.log('→ count_tokens on the Hebrew eval sample …')
  const ctRes = await fetch(`${API}/messages/count_tokens`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: HEBREW_SAMPLE }],
    }),
  })
  const ctBody = await ctRes.json()
  if (!ctRes.ok) {
    console.error(`✗ count_tokens failed (HTTP ${ctRes.status}):`, JSON.stringify(ctBody, null, 2))
    process.exit(1)
  }
  const chars = HEBREW_SAMPLE.length
  const tokens = ctBody.input_tokens
  const charsPerToken = (chars / tokens).toFixed(2)
  console.log(`✓ Hebrew sample: ${chars} chars → ${tokens} tokens (${charsPerToken} chars/token)`)

  const rpm = limits['anthropic-ratelimit-requests-limit']
  const tier = guessTier(rpm)
  console.log(`✓ rate-limit tier (inferred from ${rpm ?? '?'} RPM): ${tier}`)

  const report = `# Ticket 11 — Anthropic key verification

Ran: ${new Date().toISOString()} · model: \`${MODEL}\` · script: \`scripts/anthropic-verify.mjs\`

## Metered call

- HTTP ${msgRes.status}, message id \`${msgBody.id}\`, stop_reason \`${msgBody.stop_reason}\`
- Answer: ${answer}
- Usage: ${JSON.stringify(msgBody.usage)}

## Rate-limit headers (the org's live limits for ${MODEL})

${
  Object.entries(limits)
    .map(([k, v]) => `- \`${k}\`: ${v}`)
    .join('\n') || '- (none returned)'
}

**Inferred tier:** ${tier} — per the Start/Build/Scale table in
\`.scratch/smart-layer/research/02-agent-sdk.md\` §8. The founder-confirmed tier from the
Console limits page is appended below by the wizard.

## Hebrew token re-baseline (count_tokens, ${MODEL})

- Sample: ${HEBREW_SAMPLE.split(' ').length}-word concatenation of the 16 real eval questions
  (\`docs/eval/retrieval-eval-set.md\`)
- ${chars} chars → **${tokens} tokens** → **${charsPerToken} chars/token** for Hebrew on ${MODEL}
- Replaces the pricing-page +30% assumption in \`research/09-cost-budgets.md\` — recompute the
  per-answer arithmetic with this measured figure when the spec (ticket 10) is written.
`

  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true })
  fs.writeFileSync(RESULTS_PATH, report, 'utf8')
  console.log(`✓ wrote ${path.relative(process.cwd(), RESULTS_PATH)} (no secrets in it)`)
}

main().catch((err) => {
  console.error('✗ verification failed:', err)
  process.exit(1)
})
