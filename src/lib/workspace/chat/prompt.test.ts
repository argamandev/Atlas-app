import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChatPrompt, parseChatAnswer } from './prompt'

const base = {
  workspaceName: 'תיגבור',
  shelf: [{ title: 'שיחת משקיעים Q1 2026', kind: 'transcript' }],
  context: 'ההכנסות עמדו על 359 מיליון ש"ח.',
  truncated: [],
  conversation: [{ role: 'user' as const, content: 'מה ההכנסות?' }],
}

// ── grounding ────────────────────────────────────────────────────────────────
// The whole value of this chat is that it reads the shelf instead of recalling
// the company. These assertions are the contract, not decoration.

test('the shelf and its text both reach the model', () => {
  const p = buildChatPrompt(base)
  assert.ok(p.includes('שיחת משקיעים Q1 2026'))
  assert.ok(p.includes('359 מיליון'))
  assert.ok(p.includes('ANALYST: מה ההכנסות?'))
})

test('a file read only in part is named, so the answer can admit the gap', () => {
  const p = buildChatPrompt({ ...base, truncated: ['שיחת משקיעים Q1 2026'] })
  assert.ok(p.includes('ONLY PART OF THESE'))
  assert.ok(p.includes('- שיחת משקיעים Q1 2026'))
})

test('a marked passage is its own block, so "this" has a referent', () => {
  const p = buildChatPrompt({
    ...base,
    selection: { title: 'דוח דירקטוריון · עמוד 4', text: 'הרווח התפעולי 12.5 מיליון' },
  })
  assert.ok(p.includes('MARKED THIS PASSAGE'))
  assert.ok(p.includes('דוח דירקטוריון · עמוד 4'))
  assert.ok(p.includes('הרווח התפעולי 12.5 מיליון'))
})

// ── clippings ────────────────────────────────────────────────────────────────
// The images ride in the message ABOVE this text (askModel puts them there).
// Without a line saying so, a model handed one picture and a wall of transcript
// answers from the transcript and never looks — and the analyst cannot tell,
// because the answer is fluent either way.

test('no clipping means no clipping paragraph', () => {
  assert.ok(!buildChatPrompt(base).includes('CLIPPED'))
  assert.ok(!buildChatPrompt({ ...base, snipCount: 0 }).includes('CLIPPED'))
})

test('one clipping is announced in the singular, several in the plural', () => {
  const one = buildChatPrompt({ ...base, snipCount: 1 })
  assert.ok(one.includes('CLIPPED A REGION'))
  assert.ok(one.includes('ATTACHED IT ABOVE'))

  const many = buildChatPrompt({ ...base, snipCount: 3 })
  assert.ok(many.includes('CLIPPED 3 REGIONS'))
  assert.ok(many.includes('ATTACHED THEM ABOVE'))
})

test('an illegible figure in a clipping must be admitted, not guessed', () => {
  // The failure this guards is specific: a low-resolution crop where a model
  // reads 359 as 350 and states it with the same confidence as the text.
  assert.ok(buildChatPrompt({ ...base, snipCount: 1 }).includes('not legible'))
})

// ── the answer ───────────────────────────────────────────────────────────────

test('an empty or unparseable answer is refused, never rendered as a blank turn', () => {
  assert.equal(parseChatAnswer('nonsense'), null)
  assert.equal(parseChatAnswer('{"reply":""}'), null)
  assert.equal(parseChatAnswer('{"reply":"   "}'), null)
})

test('a request to BRING a file comes back as wantsDocuments, not as an answer', () => {
  const a = parseChatAnswer('{"reply":"מחפש","wantsDocuments":"תביא את שיחת Q3"}')
  assert.equal(a?.wantsDocuments, 'תביא את שיחת Q3')
  // An empty string is not a request — it must not send the user into the
  // intake conversation with nothing typed in it.
  assert.equal(parseChatAnswer('{"reply":"ok","wantsDocuments":""}')?.wantsDocuments, null)
  assert.equal(parseChatAnswer('{"reply":"ok"}')?.wantsDocuments, null)
})
