import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSelection, orderBySelection, buildSelectionPrompt } from './selectSources'
import type { AttachableSource } from '../data'

const CORPUS: AttachableSource[] = [
  {
    sourceId: 'r1',
    kind: 'document',
    title: 'דוח דירקטוריון Q1 2026',
    company: 'תיגבור',
    when: '2026-07-15',
  },
  {
    sourceId: 'r2',
    kind: 'document',
    title: 'דוח דירקטוריון Q2 2026',
    company: 'תיגבור',
    when: '2026-07-16',
  },
  {
    sourceId: 'c1',
    kind: 'transcript',
    title: 'שיחת משקיעים - רבעון ראשון לשנת 2026',
    company: 'תיגבור',
    when: '2026-06-03',
  },
  {
    sourceId: 'c2',
    kind: 'transcript',
    title: 'שיחת משקיעים - רבעון רביעי ושנת 2025',
    company: 'תיגבור',
    when: '2026-05-13',
  },
]

test('reads a reply and the chosen ids', () => {
  const s = parseSelection('{"reply":"מוסיף שלושה קבצים.","selected":["r1","r2","c1"]}', CORPUS)
  assert.ok(s)
  assert.equal(s.reply, 'מוסיף שלושה קבצים.')
  assert.deepEqual(s.selectedIds, ['r1', 'r2', 'c1'])
  assert.deepEqual(s.dropped, [])
})

// THE GUARD THAT MAKES THE WHOLE STEP SAFE. The model writes prose now, so
// nothing it says may be able to conjure a file — an id it was not given is
// dropped before it can reach a shelf.
test('drops an id that is not in the corpus', () => {
  const s = parseSelection('{"reply":"ok","selected":["r1","INVENTED","c1"]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.selectedIds, ['r1', 'c1'])
  assert.deepEqual(s.dropped, ['INVENTED'])
})

test('de-duplicates repeated ids', () => {
  const s = parseSelection('{"reply":"ok","selected":["r1","r1","r2"]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.selectedIds, ['r1', 'r2'])
})

test('an empty selection is legitimate when the reply explains it', () => {
  const s = parseSelection('{"reply":"אין לי דוחות מ-2019.","selected":[]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.selectedIds, [])
  assert.equal(s.reply, 'אין לי דוחות מ-2019.')
})

// Without a sentence this is not the conversational answer the step exists to
// produce, so it is refused and the caller falls back to the deterministic path.
test('refuses an answer with no reply text', () => {
  assert.equal(parseSelection('{"selected":["r1"]}', CORPUS), null)
  assert.equal(parseSelection('{"reply":"   ","selected":["r1"]}', CORPUS), null)
})

test('refuses an answer with no selected array', () => {
  assert.equal(parseSelection('{"reply":"ok"}', CORPUS), null)
  assert.equal(parseSelection('{"reply":"ok","selected":"r1"}', CORPUS), null)
})

test('refuses unparseable output', () => {
  assert.equal(parseSelection('I picked the first two!', CORPUS), null)
})

test('survives fencing and a stray trailing brace, like the real model does', () => {
  const s = parseSelection('```json\n{"reply":"ok","selected":["r2"]}\n```\n}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.selectedIds, ['r2'])
})

test('ignores non-string entries rather than crashing', () => {
  const s = parseSelection('{"reply":"ok","selected":["r1",7,null,{"id":"r2"}]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.selectedIds, ['r1'])
})

test('orderBySelection keeps the model order and returns the rest', () => {
  const { selected, others } = orderBySelection(CORPUS, ['c1', 'r2'])
  assert.deepEqual(
    selected.map((s) => s.sourceId),
    ['c1', 'r2']
  )
  assert.deepEqual(
    others.map((s) => s.sourceId),
    ['r1', 'c2']
  )
})

test('the prompt carries every file with its type, date and title', () => {
  const p = buildSelectionPrompt(CORPUS, 'שני הדוחות של 2026 והשיחה האחרונה')
  for (const s of CORPUS) assert.ok(p.includes(s.sourceId), `${s.sourceId} missing from the prompt`)
  // A call and a report must be distinguishable, or "the last call" is unanswerable.
  assert.ok(p.includes('type: call'))
  assert.ok(p.includes('type: report'))
  assert.ok(p.includes('2026-07-16'))
  assert.ok(p.includes('שני הדוחות של 2026 והשיחה האחרונה'))
})
