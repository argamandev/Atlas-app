import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chunkTranscriptSections,
  chunkFilingPage,
  speakersById,
  transcriptPrefix,
  WINDOW,
  PAGE,
} from './chunker'

// ─────────────────────────────────────────────────────────────────────────────
// The chunk-shape laws (ingestion standard §5), each asserted in the user's
// terms (M2): windows cut on speaker seams past target, hard-cut at max, Q&A
// pairs stay together, parts keep their page number — and the content /
// embedding_input separation that drift comparison depends on.
// ─────────────────────────────────────────────────────────────────────────────

const line = (n: number, speakerId: string, text: string) => ({
  id: `L${String(n).padStart(4, '0')}`,
  speakerId,
  text,
})

const heb = (n: number) => 'שורה של טקסט עברי לבדיקה '.repeat(n).trim()

test('short Q&A pairs stay in one window (seam cut only past TARGET)', () => {
  const sections = [
    {
      title: 'שאלות ותשובות',
      lines: [line(1, 'sp1', 'שאלה קצרה על ההכנסות?'), line(2, 'sp2', 'תשובה קצרה: גדלנו.')],
    },
  ]
  const chunks = chunkTranscriptSections(sections, 'תיגבור', { sp1: 'אנליסט', sp2: 'מנכ"ל' })
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].firstLineId, 'L0001')
  assert.equal(chunks[0].lastLineId, 'L0002')
  assert.deepEqual(chunks[0].speakers, ['אנליסט', 'מנכ"ל'])
})

test('a speaker change past TARGET cuts the window at the seam', () => {
  // First speaker crosses TARGET on their own, then the speaker changes.
  const longText = heb(30) // ~750 chars > TARGET
  assert.ok(longText.length >= WINDOW.TARGET && longText.length < WINDOW.MAX)
  const sections = [
    {
      title: 'סקירת הנהלה',
      lines: [line(1, 'sp1', longText), line(2, 'sp2', 'דובר חדש פותח נושא.')],
    },
  ]
  const chunks = chunkTranscriptSections(sections, 'תיגבור', { sp1: 'מנכ"ל', sp2: 'סמנכ"ל' })
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].lastLineId, 'L0001')
  assert.equal(chunks[1].firstLineId, 'L0002')
})

test('MAX is a hard cut even mid-speaker', () => {
  const a = heb(25) // ~625
  const b = heb(25)
  const sections = [{ title: 'סקירה', lines: [line(1, 'sp1', a), line(2, 'sp1', b)] }]
  const chunks = chunkTranscriptSections(sections, 'חברה', { sp1: 'דובר' })
  // a + b > MAX so the second line starts a new window despite same speaker.
  assert.equal(chunks.length, 2)
  for (const c of chunks) assert.ok(c.content.length <= WINDOW.MAX)
})

test('LAW: content is verbatim and the prefix never enters it; embeddingInput = prefix + content', () => {
  const sections = [{ title: 'סקירת הנהלה', lines: [line(31, 'sp1', 'ההכנסות צמחו עשרים אחוז.')] }]
  const chunks = chunkTranscriptSections(sections, 'בזן', { sp1: 'מנכ"ל' })
  assert.equal(chunks.length, 1)
  const c = chunks[0]
  assert.equal(c.content, 'ההכנסות צמחו עשרים אחוז.')
  assert.equal(c.embeddingInput, transcriptPrefix('בזן', 'סקירת הנהלה', ['מנכ"ל']) + c.content)
  // The forbidden shape from research/01 §7 — a metadata prefix inside content.
  assert.ok(!/^.+ · .+ · .+:\n/.test(c.content), 'content must not start with a metadata prefix')
})

test('anchors carry the ORIGINAL line ids and their numeric forms', () => {
  const sections = [{ title: 'ס', lines: [line(7, 'sp1', 'אחת'), line(9, 'sp1', 'שתיים')] }]
  const [c] = chunkTranscriptSections(sections, 'ח', { sp1: 'ד' })
  assert.equal(c.firstLineId, 'L0007')
  assert.equal(c.lastLineId, 'L0009')
  assert.equal(c.firstLine, 7)
  assert.equal(c.lastLine, 9)
})

test('empty and whitespace-only lines never make chunks', () => {
  const sections = [{ title: 'ס', lines: [line(1, 'sp1', '   '), line(2, 'sp1', '')] }]
  assert.deepEqual(chunkTranscriptSections(sections, 'ח', {}), [])
})

test('filing: a small page is one chunk with partNo null', () => {
  const chunks = chunkFilingPage('תוכן עמוד קצר.', 4, 'איי.סי.אל', 'דוח רבעון ראשון')
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].pageNo, 4)
  assert.equal(chunks[0].partNo, null)
  assert.equal(chunks[0].content, 'תוכן עמוד קצר.')
  assert.ok(chunks[0].embeddingInput.endsWith('תוכן עמוד קצר.'))
  assert.ok(chunks[0].embeddingInput.includes("עמ' 4"))
})

test('filing: an oversized page splits into parts that ALL keep the page number', () => {
  const longPage = Array.from(
    { length: 120 },
    (_, i) => `שורה ${i} בעמוד ארוך מאוד של דוח כספי עם עוד מלל שממלא את השורה`
  ).join('\n')
  assert.ok(longPage.length > PAGE.SPLIT)
  const chunks = chunkFilingPage(longPage, 12, 'תיגבור', 'דוח שנתי')
  assert.ok(chunks.length > 1)
  chunks.forEach((c, i) => {
    assert.equal(c.pageNo, 12)
    assert.equal(c.partNo, i + 1)
    assert.ok(c.content.length <= PAGE.PART + 100, 'parts stay near the part budget')
    assert.ok(c.embeddingInput.includes(`עמ' 12 (${i + 1})`))
  })
  // Splitting never loses text: parts reassemble to the page.
  assert.equal(chunks.map((c) => c.content).join('\n'), longPage)
})

test('speakersById prefers name, falls back to title then id', () => {
  assert.deepEqual(
    speakersById([{ id: 'sp1', name: 'דנה כהן' }, { id: 'sp2', name: '', title: 'מנכ"ל' }, { id: 'sp3' }]),
    { sp1: 'דנה כהן', sp2: 'מנכ"ל', sp3: 'sp3' }
  )
})
