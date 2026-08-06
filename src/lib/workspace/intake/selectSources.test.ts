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

// OBSERVED IN THE BROWSER, 2026-08-04: the model wrote raw ids into its Hebrew
// sentence — "…של תיגבור (e231c676-23d6-4a86-8d02-…) ולשיחת המשקיעים
// (PyuMxe88e8g_live)?". A uuid mid-sentence is exactly the machine-feel this
// step exists to remove, so the prompt rule is backed by a scrub.
test('strips internal ids out of the sentence, and the brackets around them', () => {
  const s = parseSelection(
    '{"reply":"רק מוודא — דוח הדירקטוריון (r1) והשיחה האחרונה (c1)?","status":"clarifying","selected":["r1","c1"]}',
    // ids must be long enough to be worth removing; use realistic ones
    [
      { ...CORPUS[0], sourceId: 'e231c676-23d6-4a86-8d02-aaaaaaaaaaaa' },
      { ...CORPUS[2], sourceId: 'PyuMxe88e8g_live' },
    ]
  )
  assert.ok(s)
  const s2 = parseSelection(
    '{"reply":"מוודא — דוח (e231c676-23d6-4a86-8d02-aaaaaaaaaaaa) ושיחה (PyuMxe88e8g_live)?","status":"clarifying","selected":[]}',
    [
      { ...CORPUS[0], sourceId: 'e231c676-23d6-4a86-8d02-aaaaaaaaaaaa' },
      { ...CORPUS[2], sourceId: 'PyuMxe88e8g_live' },
    ]
  )
  assert.ok(s2)
  assert.ok(!s2.reply.includes('e231c676'), s2.reply)
  assert.ok(!s2.reply.includes('PyuMxe88e8g_live'), s2.reply)
  assert.ok(!s2.reply.includes('()'), s2.reply)
  assert.equal(s2.reply, 'מוודא — דוח ושיחה?')
})

test('leaves an ordinary sentence untouched', () => {
  const s = parseSelection('{"reply":"מושך את שלושת הקבצים.","status":"ready","selected":["r1"]}', CORPUS)
  assert.ok(s)
  assert.equal(s.reply, 'מושך את שלושת הקבצים.')
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
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'שני הדוחות של 2026 והשיחה האחרונה' }])
  for (const s of CORPUS) assert.ok(p.includes(s.sourceId), `${s.sourceId} missing from the prompt`)
  // A call and a report must be distinguishable, or "the last call" is unanswerable.
  assert.ok(p.includes('type: call'))
  assert.ok(p.includes('type: report'))
  assert.ok(p.includes('2026-07-16'))
  assert.ok(p.includes('שני הדוחות של 2026 והשיחה האחרונה'))
})

// ── the standing proposal ────────────────────────────────────────────────────
// Founder, 2026-08-04: "he only pulled 1 file while i asked for two files and we
// agreed on them." The model had to re-read its own Hebrew prose each turn to
// recall what it had proposed. Now it is stated to it as a fact.

test('the prompt states the set already proposed, with titles', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'כן' }], ['r1', 'c1'])
  assert.ok(p.includes('THE FILES YOU ALREADY PROPOSED'))
  assert.ok(p.includes('id: r1 | דוח דירקטוריון Q1 2026'))
  assert.ok(p.includes('id: c1 | שיחת משקיעים - רבעון ראשון לשנת 2026'))
  // and it must say what to DO with them, not merely list them
  assert.ok(p.includes('Carry every one of them forward'))
})

test('with nothing proposed yet the prompt does not mention a standing set', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא לי דוחות' }])
  assert.ok(!p.includes('THE FILES YOU ALREADY PROPOSED'))
})

// ── what the shelf already holds ─────────────────────────────────────────────
// Filed from a live run, 2026-08-06. Asked to pull Tigbur's reports, the intake
// proposed the entire shelf back — it had never been shown what was on it.
// It matters more than wasted words because the corpus holds some calls twice
// under different ids with the SAME title (PyuMxe88e8g / PyuMxe88e8g_live), so
// agreeing can attach a second row no unique index can catch.

test('a file already on the shelf is marked as such, with a rule about it', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא לי דוחות' }], [], ['c1'])
  assert.ok(p.includes('ALREADY ON THE SHELF'))
  assert.ok(p.includes('Never offer to pull one'))
  // AND in the operative list at the END of the prompt. Stating it only beside
  // the file list was not enough: run 1 of this fix marked the three calls
  // correctly and the model confirmed all three anyway, because "How to behave"
  // is where the instructions it actually follows live.
  const behave = p.slice(p.indexOf('How to behave:'))
  assert.ok(behave.includes('ALREADY ON THE SHELF'), 'the rule must also be in the behaviour list')
  // the marker rides on that file's own line, not as a separate list
  const line = p.split('\n').find((l) => l.includes('id: c1')) ?? ''
  assert.ok(line.includes('ALREADY ON THE SHELF'), "the marker must be on c1's own line")
  const other = p.split('\n').find((l) => l.includes('id: c2')) ?? ''
  assert.ok(!other.includes('ALREADY ON THE SHELF'))
})

test('an empty shelf adds no rule and no marker', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא לי דוחות' }], [], [])
  assert.ok(!p.includes('ALREADY ON THE SHELF'))
})

test('shelf ids that are not in the candidate list raise no rule', () => {
  // Narrowing can cut a shelf file out of the candidates; the rule would then
  // describe a marker that appears nowhere.
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'דוחות' }], [], ['not-a-candidate'])
  assert.ok(!p.includes('Never offer to pull one'))
})

test('reads an explicit removal', () => {
  const s = parseSelection(
    '{"reply":"הורדתי את השיחה.","status":"ready","selected":["r1"],"removed":["c1"]}',
    CORPUS
  )
  assert.ok(s)
  assert.deepEqual(s.selectedIds, ['r1'])
  assert.deepEqual(s.removedIds, ['c1'])
})

test('no removed field means nothing was removed — not everything', () => {
  const s = parseSelection('{"reply":"ok","status":"ready","selected":["r1"]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.removedIds, [])
})

test('an unknown id in removed is ignored without alarming', () => {
  const s = parseSelection('{"reply":"ok","selected":["r1"],"removed":["GHOST"]}', CORPUS)
  assert.ok(s)
  assert.deepEqual(s.removedIds, [])
  // `dropped` is the invented-SELECTION alarm; a phantom removal removes nothing
  // and must not trip it.
  assert.deepEqual(s.dropped, [])
})

test('the prompt carries the whole conversation, both sides', () => {
  const p = buildSelectionPrompt(CORPUS, [
    { role: 'user', content: 'תביא לי את הדוחות של תיגבור' },
    { role: 'assistant', content: 'רק לוודא — שני דוחות הדירקטוריון של 2026?' },
    { role: 'user', content: 'כן, ותוסיף גם את השיחה האחרונה' },
  ])
  assert.ok(p.includes('ANALYST: תביא לי את הדוחות של תיגבור'))
  assert.ok(p.includes('YOU: רק לוודא — שני דוחות הדירקטוריון של 2026?'))
  assert.ok(p.includes('ANALYST: כן, ותוסיף גם את השיחה האחרונה'))
})

// ── the confirmation gate ────────────────────────────────────────────────────
// Founder, 2026-08-04: "once the user says, yeah, pull those files, then only
// then Atlas goes, okay, I'm pulling them." Nothing may reach a shelf while the
// status is anything other than an explicit `ready`.

test('reads status ready', () => {
  const s = parseSelection('{"reply":"מושך אותם עכשיו.","status":"ready","selected":["r1","c1"]}', CORPUS)
  assert.ok(s)
  assert.equal(s.status, 'ready')
  assert.deepEqual(s.selectedIds, ['r1', 'c1'])
})

test('reads status clarifying', () => {
  const s = parseSelection(
    '{"reply":"רק לוודא — הדוח של Q1 והשיחה האחרונה?","status":"clarifying","selected":["r1","c1"]}',
    CORPUS
  )
  assert.ok(s)
  assert.equal(s.status, 'clarifying')
  // It may still name what it is proposing — that is what it is confirming.
  assert.deepEqual(s.selectedIds, ['r1', 'c1'])
})

test('ANY status that is not exactly "ready" keeps the conversation going', () => {
  // A missing, misspelled or unexpected status must never be able to trigger a
  // pull the user did not agree to. Erring towards one more message is cheap;
  // erring the other way spends the user's trust.
  for (const raw of [
    '{"reply":"x","selected":["r1"]}',
    '{"reply":"x","status":"READY","selected":["r1"]}',
    '{"reply":"x","status":"done","selected":["r1"]}',
    '{"reply":"x","status":true,"selected":["r1"]}',
    '{"reply":"x","status":null,"selected":["r1"]}',
  ]) {
    const s = parseSelection(raw, CORPUS)
    assert.ok(s, raw)
    assert.equal(s.status, 'clarifying', raw)
  }
})
