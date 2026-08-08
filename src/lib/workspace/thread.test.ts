import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseThreadMessages,
  readThreadMessages,
  deriveThreadTitle,
  threadChars,
  THREAD_MAX_MESSAGES,
  THREAD_MAX_CHARS,
  THREAD_TITLE_MAX,
  type StoredMsg,
} from './thread'

const user = (content: string): StoredMsg => ({ role: 'user', content })

test('a plain exchange round-trips with every field it is allowed to keep', () => {
  const r = parseThreadMessages({
    messages: [
      {
        role: 'user',
        content: 'מה אמרו על המרווח הגולמי?',
        reference: 'המרווח הגולמי עלה ל־31%',
        referenceTitle: 'דוח דירקטוריון Q1 2026 · עמוד 4',
      },
      { role: 'assistant', content: 'They said margin rose to 31%.', caveat: ['deck.pdf'] },
    ],
  })
  assert.ok(r.ok)
  assert.equal(r.value.length, 2)
  assert.equal(r.value[0].referenceTitle, 'דוח דירקטוריון Q1 2026 · עמוד 4')
  assert.deepEqual(r.value[1].caveat, ['deck.pdf'])
})

// THE POINT OF THE MODULE. A clipping's base64 image must not reach the row —
// it is up to 2MB, there can be four per turn, and the warm read fetches this
// column on every open. The pages survive so the message can still say what it
// was asked about.
test('a clipping is stored as its page number and never as its image', () => {
  const r = parseThreadMessages({
    messages: [
      {
        role: 'user',
        content: 'what does this table say?',
        snipPages: [4, 7],
        snips: [{ dataUrl: 'data:image/png;base64,AAAA', page: 4, documentId: 'd1' }],
      },
    ],
  })
  assert.ok(r.ok)
  assert.deepEqual(r.value[0].snipPages, [4, 7])
  assert.equal('snips' in r.value[0], false, 'the image survived into the stored message')
  assert.equal(JSON.stringify(r.value).includes('base64'), false)
})

// Every field is REBUILT rather than spread, so a jsonb column cannot become a
// dumping ground for whatever a client felt like sending.
test('unknown keys are dropped rather than carried into the row', () => {
  const r = parseThreadMessages({
    messages: [{ role: 'user', content: 'hi', dataUrl: 'data:image/png;base64,QQ', evil: true }],
  })
  assert.ok(r.ok)
  assert.deepEqual(Object.keys(r.value[0]).sort(), ['content', 'role'])
})

test('a message with an unknown role or no content is refused, naming which one', () => {
  const bad = parseThreadMessages({ messages: [user('ok'), { role: 'system', content: 'x' }] })
  assert.equal(bad.ok, false)
  assert.match((bad as { error: string }).error, /message 1/)

  const noContent = parseThreadMessages({ messages: [{ role: 'user' }] })
  assert.equal(noContent.ok, false)
  assert.match((noContent as { error: string }).error, /content/)
})

test('a body that is not an array of messages is refused', () => {
  assert.equal(parseThreadMessages(null).ok, false)
  assert.equal(parseThreadMessages({}).ok, false)
  assert.equal(parseThreadMessages({ messages: 'nope' }).ok, false)
})

// Refused, NOT truncated — the house rule. A conversation that reads complete
// on screen while the tail was silently dropped is the worse failure.
test('an oversized conversation is refused rather than quietly shortened', () => {
  const many = Array.from({ length: THREAD_MAX_MESSAGES + 1 }, () => user('x'))
  const r = parseThreadMessages({ messages: many })
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, new RegExp(String(THREAD_MAX_MESSAGES)))

  const huge = [user('x'.repeat(THREAD_MAX_CHARS + 1))]
  const c = parseThreadMessages({ messages: huge })
  assert.equal(c.ok, false)
  assert.match((c as { error: string }).error, new RegExp(String(THREAD_MAX_CHARS)))
})

test('threadChars counts the reference and caveats, not only the message body', () => {
  const n = threadChars([
    { role: 'user', content: 'abc', reference: 'de', referenceTitle: 'f', caveat: ['gh'] },
  ])
  assert.equal(n, 3 + 2 + 1 + 2)
})

// A READ salvages; a WRITE refuses. The asymmetry is deliberate: a row written
// by an older shape must not stop its workspace from opening.
test('reading a stored column keeps the entries it understands and drops the rest', () => {
  const got = readThreadMessages([
    { role: 'user', content: 'kept' },
    { role: 'system', content: 'dropped' },
    'not an object',
    { role: 'assistant', content: 'kept too' },
  ])
  assert.deepEqual(
    got.map((m) => m.content),
    ['kept', 'kept too']
  )
})

test('reading a column that is missing or not an array gives an empty conversation', () => {
  assert.deepEqual(readThreadMessages(null), [])
  assert.deepEqual(readThreadMessages(undefined), [])
  assert.deepEqual(readThreadMessages({ messages: [] }), [])
})

test('the thread title is the opening question, cut to a line on a word boundary', () => {
  assert.equal(deriveThreadTitle([]), '')
  assert.equal(
    deriveThreadTitle([{ role: 'assistant', content: 'a' }, user('  what   changed?  ')]),
    'what changed?'
  )

  const long = deriveThreadTitle([user('word '.repeat(60))])
  assert.ok(long.length <= THREAD_TITLE_MAX + 1, `title was ${long.length} chars`)
  assert.ok(long.endsWith('…'))
  assert.equal(long.includes('  '), false)
})

test('a title exactly at the limit is not given an ellipsis it does not need', () => {
  const exact = 'x'.repeat(THREAD_TITLE_MAX)
  assert.equal(deriveThreadTitle([user(exact)]), exact)
})
