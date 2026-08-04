import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContext, contentToText, CONTEXT_BUDGET_CHARS } from './context'
import { parseChatAnswer, buildChatPrompt } from './prompt'
import type { ItemContent } from '../contentTypes'

const src = (title: string, chars: number, itemId = title) => ({
  itemId,
  title,
  kind: 'transcript',
  text: 'x'.repeat(chars),
})

// ── what the model is allowed to see ─────────────────────────────────────────

test('a shelf that fits is sent whole, and nothing is reported missing', () => {
  const built = buildContext([src('call A', 1000), src('report B', 2000)])
  assert.deepEqual(built.truncated, [])
  assert.deepEqual(built.omitted, [])
  assert.ok(built.text.includes('call A'))
  assert.ok(built.text.includes('report B'))
})

test('a file that had to be cut short is NAMED, never silently shortened', () => {
  // The entire reason this returns a report rather than just a string: an answer
  // drawn from the first third of a transcript reads exactly like a complete one.
  const built = buildContext([src('a very long call', 5000)], 1000)
  assert.deepEqual(built.truncated, ['a very long call'])
  assert.ok(built.text.length < 5000)
})

test('the budget is shared, so one long file cannot hide the others', () => {
  // First-come-first-served would spend the whole allowance on the long call and
  // leave the short one out of the prompt entirely — and a question about "both
  // calls" would then be answered from one of them with no sign of it.
  const built = buildContext([src('huge call', 100_000), src('short note', 400)], 10_000)
  assert.ok(built.text.includes('short note'), 'the short file must survive')
  assert.deepEqual(built.truncated, ['huge call'])
})

test('a slice too small to be worth reading is omitted rather than teased', () => {
  const built = buildContext([src('a', 50_000), src('b', 50_000), src('c', 50_000)], 900)
  assert.equal(built.truncated.length + built.omitted.length, 3)
  assert.ok(built.omitted.length > 0)
})

test('an empty shelf produces empty context and no false report', () => {
  const built = buildContext([])
  assert.equal(built.text, '')
  assert.deepEqual(built.truncated, [])
  assert.deepEqual(built.omitted, [])
})

test('items with no text at all do not count against the budget', () => {
  const built = buildContext([src('real', 200), { ...src('empty', 0), text: '   ' }])
  assert.ok(built.text.includes('real'))
  assert.ok(!built.text.includes('empty'))
})

test('the default budget is big enough for a couple of real calls', () => {
  // A 2h Hebrew investor call is roughly 50k characters.
  assert.ok(CONTEXT_BUDGET_CHARS >= 100_000)
})

// ── flattening ───────────────────────────────────────────────────────────────

test('a transcript flattens to speaker-attributed lines with their ids', () => {
  const content: ItemContent = {
    kind: 'transcript',
    title: 'תיגבור Q1',
    company: 'תיגבור',
    quarter: 'Q1 2026',
    date: '2026-07-16',
    sections: [
      {
        id: 's1',
        title: 'דברי הנהלה',
        lines: [{ id: 'L0001', speaker: 'אורית', timestamp: '00:00:00', text: 'בוקר טוב' }],
      },
    ],
  }
  const text = contentToText(content)
  assert.ok(text.includes('דברי הנהלה'))
  assert.ok(text.includes('[L0001] אורית: בוקר טוב'))
})

test('a document flattens to page-marked text', () => {
  const text = contentToText({
    kind: 'document',
    title: 'דוח',
    docType: 'annual',
    quarter: 'Q1 2026',
    documentId: 'doc-1',
    pageCount: 31,
    pages: [{ pageNo: 4, text: 'ההכנסות' }],
  })
  assert.ok(text.includes('[p.4]'))
  assert.ok(text.includes('ההכנסות'))
})

test('a PDF with no extracted text contributes nothing but is still a document', () => {
  // It renders — PdfViewer reads the file itself — so `loadDocument` no longer
  // refuses it. It just cannot be ASKED about, and the chat route reports that
  // rather than the pane hiding a file the user can see.
  const text = contentToText({
    kind: 'document',
    title: 'scanned filing',
    docType: 'report',
    quarter: 'Q1 2026',
    documentId: 'doc-2',
    pageCount: 12,
    pages: [],
  })
  assert.equal(text, '')
})

test('an unavailable item contributes nothing', () => {
  assert.equal(contentToText({ kind: 'unavailable', title: 't', reason: 'processing' }), '')
})

// ── the answer ───────────────────────────────────────────────────────────────

test('an answer with no sentence is refused rather than rendered blank', () => {
  assert.equal(parseChatAnswer('{"reply":"","wantsDocuments":null}'), null)
  assert.equal(parseChatAnswer('not json at all'), null)
  assert.equal(parseChatAnswer('{"wantsDocuments":"the Q3 call"}'), null)
})

test('a plain answer carries no document request', () => {
  const a = parseChatAnswer('{"reply":"ההכנסות עלו ב-8%.","wantsDocuments":null}')
  assert.equal(a?.reply, 'ההכנסות עלו ב-8%.')
  assert.equal(a?.wantsDocuments, null)
})

test('a request for more files is handed on, not acted on here', () => {
  // The chat never attaches anything itself — this string goes to the intake
  // conversation, which confirms the files in words and waits for a yes.
  const a = parseChatAnswer('{"reply":"מחפש…","wantsDocuments":"השיחה של תמיס לרבעון השלישי"}')
  assert.equal(a?.wantsDocuments, 'השיחה של תמיס לרבעון השלישי')
})

test('an empty wantsDocuments string is treated as no request', () => {
  const a = parseChatAnswer('{"reply":"ok","wantsDocuments":"   "}')
  assert.equal(a?.wantsDocuments, null)
})

// ── the prompt ───────────────────────────────────────────────────────────────

test('the prompt tells the model which files it saw only part of', () => {
  const p = buildChatPrompt({
    workspaceName: 'תיגבור',
    shelf: [{ title: 'call A', kind: 'transcript' }],
    context: 'some text',
    truncated: ['call A'],
    conversation: [{ role: 'user', content: 'מה ההכנסות?' }],
  })
  assert.ok(p.includes('ONLY PART OF THESE'))
  assert.ok(p.includes('call A'))
})

test('a marked passage arrives as its own block, so "this" is unambiguous', () => {
  const p = buildChatPrompt({
    workspaceName: 'w',
    shelf: [],
    context: '',
    truncated: [],
    conversation: [{ role: 'user', content: 'what does this mean?' }],
    selection: { title: 'תיגבור Q1', text: 'המרווח התפעולי השתפר' },
  })
  assert.ok(p.includes('MARKED THIS PASSAGE'))
  assert.ok(p.includes('המרווח התפעולי השתפר'))
  assert.ok(p.includes('תיגבור Q1'))
})

test('an empty shelf says so rather than leaving the model to assume', () => {
  const p = buildChatPrompt({
    workspaceName: 'w',
    shelf: [],
    context: '',
    truncated: [],
    conversation: [{ role: 'user', content: 'hi' }],
  })
  assert.ok(p.includes('nothing on the shelf yet'))
  assert.ok(p.includes('no readable text is available'))
})
