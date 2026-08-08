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

// ── which date is this, actually ─────────────────────────────────────────────
// Found 2026-08-07 while verifying the founder's two bugs, in the reply text of
// the very flow being fixed: Atlas offered "דוח תקופתי ושנתי לשנת 2021 שפורסם
// ב-07.08.2026" — a 2021 annual report "published" the afternoon it was pulled.
//
// One label, two meanings. A filing Atlas has NOT fetched carries MAYA's real
// publicationDate; the same filing read back out of company_documents carries
// `created_at`, the ingest moment. Both were printed as `date:` and the
// behaviour list declared, in capitals, that `date:` is when a report was
// published. All six MAYA-ingested documents in the live corpus carried an
// ingest timestamp.
//
// The real fix is a publication-date column (the value exists at ingest and is
// discarded) — DDL on the shared production DB, so it belongs to the MAYA phase.
// Labelling honestly costs nothing and stops the false sentence today.
test('a fetched filing says "published", a stored one says "added to Atlas"', () => {
  const p = buildSelectionPrompt(
    [
      {
        sourceId: 'd1',
        kind: 'document',
        title: 'דוח תקופתי ושנתי לשנת 2021',
        company: 'תיגבור',
        when: '2026-08-07',
      },
      {
        sourceId: 'maya:99',
        kind: 'document',
        title: 'דוח תקופתי ושנתי לשנת 2024',
        company: 'תיגבור',
        when: '2025-03-30',
        remote: { mayaReportId: 99, issuerId: 1, publishedISO: '2025-03-30' },
      },
    ],
    [{ role: 'user', content: 'תביא דוחות' }]
  )
  const local = p.split('\n').find((l) => l.includes('id: d1')) ?? ''
  const remote = p.split('\n').find((l) => l.includes('id: maya:99')) ?? ''
  assert.ok(local.includes('added to Atlas: 2026-08-07'), `local line was: ${local}`)
  assert.ok(!local.includes('published:'), 'a stored row must not claim a publication date')
  assert.ok(remote.includes('published: 2025-03-30'), `remote line was: ${remote}`)

  // and the rule that makes the distinction operative
  assert.ok(says(p, 'THE TWO DATE LABELS MEAN DIFFERENT THINGS'))
  assert.ok(says(p, 'NEVER present an "added to Atlas:" date as when something was published'))
  // the old false premise is gone, not merely contradicted later
  assert.equal(says(p, 'THE "date:" FIELD IS WHEN IT WAS PUBLISHED'), false)
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

// Whitespace-insensitive: these assertions are about what the prompt SAYS, and
// a sentence that rewraps when a word changes is not a regression. Two of these
// tests failed on exactly that after the 2026-08-07 rewrite.
const says = (p: string, phrase: string) => p.replace(/\s+/g, ' ').includes(phrase.replace(/\s+/g, ' '))

test('a file already on the shelf is marked as such, with a rule about it', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא לי דוחות' }], [], ['c1'])
  assert.ok(p.includes('ALREADY ON THE SHELF'))
  assert.ok(says(p, 'Never offer to pull one that IS in the list'))
  // AND in the operative list at the END of the prompt. Stating it only beside
  // the file list was not enough: run 1 of this fix marked the three calls
  // correctly and the model confirmed all three anyway, because "How to behave"
  // is where the instructions it actually follows live.
  const behave = p.slice(p.indexOf('How to behave:'))
  assert.ok(behave.includes('ON THE SHELF'), 'the rule must also be in the behaviour list')
  // the marker rides on that file's own line, not as a separate list
  const line = p.split('\n').find((l) => l.includes('id: c1')) ?? ''
  assert.ok(line.includes('ALREADY ON THE SHELF'), "the marker must be on c1's own line")
  const other = p.split('\n').find((l) => l.includes('id: c2')) ?? ''
  assert.ok(!other.includes('ALREADY ON THE SHELF'))
})

// ── FOUNDER BUG 1, 2026-08-07: "adding a document doesn't actually work" ─────
// Reproduced deterministically through the live API: a workspace holding ONE
// report, asked for an investor call that was never on it, came back
// `selected: []` — *"כבר נמצאת אצלך על המדף"*. The per-line marker was correct
// and absent from the call's line; nothing in the prompt said that an UNMARKED
// file is therefore not on the shelf, so a rule opening "FIRST, before anything
// else: drop every file marked ALREADY ON THE SHELF" swallowed it.
// A negative fact has to be asserted to be usable.
test('the shelf is stated as a COMPLETE list, so an unmarked file cannot be claimed as held', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא את השיחה' }], [], ['r1'])
  // the list itself, by title, not merely a marker on a line
  assert.ok(says(p, 'ON THE SHELF RIGHT NOW'))
  assert.ok(says(p, 'this list is COMPLETE'))
  assert.ok(p.includes('- דוח דירקטוריון Q1 2026'), 'the on-shelf file is named in the list')
  assert.ok(!p.includes('- שיחת משקיעים - רבעון ראשון'), 'an unshelved file must not be in the list')
  // and the closed-world sentence that makes the absence mean something
  assert.ok(says(p, 'A file not named in that list is NOT on the shelf'))
  // the behaviour list must say the rest still get selected
  const behave = p.slice(p.indexOf('How to behave:'))
  assert.ok(says(behave, 'EVERY OTHER FILE MUST STILL BE SELECTED'))
})

// ── FOUNDER BUG 2, same day ─────────────────────────────────────────────────
// "if i deleted a document, when i try to pull it … atlas thinks i already have
// this document". Reproduced in a workspace that had NEVER held anything: an
// empty shelf emitted no rule at all, so there was no statement for the model to
// contradict and it read "FROM MAYA — ALREADY IN ATLAS" as possession.
test('an empty shelf is STATED, because silence is what let "already here" be said about nothing', () => {
  const p = buildSelectionPrompt(CORPUS, [{ role: 'user', content: 'תביא לי דוחות' }], [], [])
  assert.ok(says(p, 'THE SHELF IS EMPTY'))
  assert.ok(says(p, 'nothing the analyst asks for can be "already here"'))
  // no per-line marker, and no behaviour rule about a list that is not there
  assert.ok(!p.includes('ALREADY ON THE SHELF'))
  assert.ok(!p.includes('ON THE SHELF RIGHT NOW'))
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

// ── a MAYA filing Atlas ALREADY holds ────────────────────────────────────────
// Found live 2026-08-06, three samples out of three. Once the 2024 annual report
// had been fetched it was correctly dropped from the REMOTE candidates (offering
// to fetch something already held is the false-achievement claim this file
// exists to prevent) — but the local row carried no sign of where it came from,
// so "get me the 2024 annual report from MAYA" found no MAYA-marked 2024 file
// and the model reached for a different YEAR that was still marked fetchable.
// Marking origin on the held row is what lets it answer "you already have it".
test('a held MAYA filing is marked as such, so "from MAYA" can still resolve to it', () => {
  const p = buildSelectionPrompt(
    [
      {
        sourceId: 'd1',
        kind: 'document',
        title: 'דוח תקופתי ושנתי לשנת 2024',
        company: 'תיגבור',
        when: '2025-03-30',
        fromMaya: true,
      },
      {
        sourceId: 'd2',
        kind: 'document',
        title: 'דוח דירקטוריון Q1 2026',
        company: 'תיגבור',
        when: '2026-07-16',
      },
    ],
    [{ role: 'user', content: 'תמשוך ממאיה את הדוח השנתי לשנת 2024' }]
  )
  assert.ok(p.includes('FROM MAYA — ALREADY IN ATLAS'))
  // the hand-ingested document must NOT be labelled as coming from MAYA
  assert.ok(!/דוח דירקטוריון Q1 2026.*FROM MAYA/.test(p))
  // and the rule that stops it reaching for another year
  assert.ok(says(p, 'Do NOT reach for a different year'))
})

// The other half of founder bug 2. This marker used to be explained as "select
// it and say Atlas already has it" — true of Atlas's LIBRARY and false of the
// analyst's shelf, and the model reported the one as the other. A filing Atlas
// has fetched before still has to be ADDED; it just arrives without a download.
test('a filing in Atlas’s library is not a filing on the shelf, and the prompt says so', () => {
  const p = buildSelectionPrompt(
    [
      {
        sourceId: 'd1',
        kind: 'document',
        title: 'דוח תקופתי ושנתי לשנת 2021',
        company: 'תיגבור',
        when: '2022-03-30',
        fromMaya: true,
      },
    ],
    [{ role: 'user', content: 'תביא את הדוח השנתי 2021' }],
    [],
    []
  )
  assert.ok(says(p, "THAT IS NOT THE SAME AS BEING ON THE ANALYST'S SHELF"))
  assert.ok(says(p, 'select it like any other file and say you are ADDING it'))
  assert.ok(says(p, 'Never answer "you already have it" off this marker'))
  // and the old instruction is gone, not merely outnumbered
  assert.equal(says(p, 'select it and say Atlas already has it'), false)
})

test('a corpus with no MAYA origin at all adds no MAYA rule', () => {
  const p = buildSelectionPrompt(
    [{ sourceId: 'd1', kind: 'document', title: 'דוח', company: 'תיגבור', when: '2026-01-01' }],
    [{ role: 'user', content: 'תביא לי דוח' }]
  )
  assert.ok(!p.includes('FROM MAYA'))
})
