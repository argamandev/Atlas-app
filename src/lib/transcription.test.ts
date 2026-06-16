import { test } from 'node:test'
import assert from 'node:assert/strict'

// transcription.ts eagerly constructs the OpenAI + Supabase clients at module load,
// and those throw without credentials. Provide harmless dummies BEFORE importing the
// module (static imports are hoisted, so env must be set first → dynamic import).
process.env.OPENAI_API_KEY ??= 'test-key'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service'

// require() (not import) so it runs AFTER the env assignments above — tsx compiles
// these tests as CommonJS, where top-level await isn't available.
const { parseGeminiOutput } = require('./transcription') as typeof import('./transcription')

test('parseGeminiOutput parses ## Name headers (GPT-4.1 fallback format)', () => {
  const md = `## דנה כהן

שלום לכולם וברוכים הבאים לשיחת המשקיעים. נתחיל בסקירת הרבעון.

## יוסי לוי

תודה דנה. ההכנסות צמחו ב-12 אחוז ברבעון.`
  const { mgmtLines, qaLines, speakers } = parseGeminiOutput(md, [])
  assert.equal(speakers.length, 2)
  assert.equal(speakers[0].name, 'דנה כהן')
  assert.equal(mgmtLines.length, 2)
  assert.equal(mgmtLines[0].speakerId, speakers[0].id)
  assert.equal(qaLines.length, 0)
})

test('parseGeminiOutput parses **Name:** headers too', () => {
  const md = `**דנה כהן:**

פסקה ראשונה של דנה.`
  const { mgmtLines, speakers } = parseGeminiOutput(md, [])
  assert.equal(speakers.length, 1)
  assert.equal(speakers[0].name, 'דנה כהן')
  assert.equal(mgmtLines.length, 1)
})
