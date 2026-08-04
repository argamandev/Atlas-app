import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFragment, parseCompose, buildComposePrompt } from './compose'

// ── the sanitiser ────────────────────────────────────────────────────────────
// This output goes STRAIGHT into a contentEditable via innerHTML, so anything
// that survives here runs in the user's session. Allow-list, never deny-list.

test('the allowed tags survive, and lose every attribute', () => {
  assert.equal(sanitizeFragment('<p class="x" dir="rtl">שלום</p>'), '<p>שלום</p>')
  assert.equal(sanitizeFragment('<h2 id="a">כותרת</h2>'), '<h2>כותרת</h2>')
  assert.equal(
    sanitizeFragment('<ul><li><strong>a</strong></li></ul>'),
    '<ul><li><strong>a</strong></li></ul>'
  )
})

test('a script goes with its contents, not just its tags', () => {
  // Unwrapping it would leave `alert(1)` in the document as literal prose —
  // harmless, but it is not writing, and a draft made only of that would then
  // count as usable.
  assert.equal(sanitizeFragment('<script>alert(1)</script>'), '')
  assert.equal(sanitizeFragment('<p>ok</p><script src="//evil"></script>'), '<p>ok</p>')
  assert.equal(sanitizeFragment('<script>never closed'), '')
})

test('an event handler goes with the tag it lived on', () => {
  // The attribute is not stripped in place — the whole <img> is not on the list,
  // so there is nothing left for onerror to hang off.
  assert.equal(sanitizeFragment('<img src=x onerror="alert(1)">'), '')
  assert.equal(sanitizeFragment('<p onclick="alert(1)">hi</p>'), '<p>hi</p>')
})

test('a link is not an allowed tag, so a javascript: href cannot exist', () => {
  assert.equal(sanitizeFragment('<a href="javascript:alert(1)">click</a>'), 'click')
})

test('an iframe, an object and a style block are all removed whole', () => {
  assert.equal(sanitizeFragment('<iframe src="//evil"></iframe>'), '')
  assert.equal(sanitizeFragment('<style>body{display:none}</style>'), '')
  assert.equal(sanitizeFragment('<object data="//evil"></object>'), '')
})

test('an unknown CONTENT tag is unwrapped, because its words still mean something', () => {
  assert.equal(sanitizeFragment('<div><p>a</p></div>'), '<p>a</p>')
  assert.equal(sanitizeFragment('<span>שלום</span>'), 'שלום')
})

test('comments are dropped rather than carried into the document', () => {
  assert.equal(sanitizeFragment('<p>a</p><!-- <script>x</script> --><p>b</p>'), '<p>a</p><p>b</p>')
})

test('a stray angle bracket in real prose is escaped, not treated as markup', () => {
  assert.equal(sanitizeFragment('<p>הרווח < 5%</p>'), '<p>הרווח &lt; 5%</p>')
})

test('tag names are normalised so casing cannot smuggle one past the list', () => {
  assert.equal(sanitizeFragment('<P>a</P>'), '<p>a</p>')
  assert.equal(sanitizeFragment('<SCRIPT>x</SCRIPT>'), '')
  assert.equal(sanitizeFragment('<ScRiPt>x</ScRiPt>'), '')
})

// ── the answer ───────────────────────────────────────────────────────────────

test('an empty or unusable draft is refused, never inserted as nothing', () => {
  assert.equal(parseCompose('{"html":"","afterHeading":null}', []), null)
  assert.equal(parseCompose('not json', []), null)
  // Everything in it was stripped, so there is nothing to add.
  assert.equal(parseCompose('{"html":"<script>x</script>","afterHeading":null}', []), null)
})

test('a draft is returned sanitized', () => {
  const r = parseCompose('{"html":"<p class=\\"x\\">שלום</p>","afterHeading":null}', [])
  assert.equal(r?.html, '<p>שלום</p>')
  assert.equal(r?.afterHeading, null)
})

test('afterHeading must name a heading the document really has', () => {
  const real = parseCompose('{"html":"<p>a</p>","afterHeading":"הדירקטוריון"}', ['הדירקטוריון'])
  assert.equal(real?.afterHeading, 'הדירקטוריון')
  // An invented anchor becomes "at the end" rather than sending the caller
  // hunting for a heading that is not there.
  const fake = parseCompose('{"html":"<p>a</p>","afterHeading":"Executive Summary"}', ['הדירקטוריון'])
  assert.equal(fake?.afterHeading, null)
})

// ── the prompt ───────────────────────────────────────────────────────────────

test('an empty document is announced as such, so Atlas writes an opening', () => {
  const p = buildComposePrompt({
    instruction: 'פתח בפסקה על הענף',
    document: '',
    context: 'some text',
    truncated: [],
    headings: [],
  })
  assert.ok(p.includes('THE DOCUMENT IS EMPTY'))
  assert.ok(p.includes('"afterHeading" must be null'))
})

test('the model is told never to restate what the document already says', () => {
  // The whole safety model rests on this being an INSERT: it never sees a
  // rewrite instruction, and the client only ever splices.
  const p = buildComposePrompt({
    instruction: 'add a paragraph',
    document: 'Existing text.',
    context: '',
    truncated: [],
    headings: ['Board'],
  })
  assert.ok(p.includes('WRITE ONLY THE NEW PASSAGE'))
  assert.ok(p.includes('Existing text.'))
  assert.ok(p.includes('- Board'))
})

test('a marked passage arrives with its source named for attribution', () => {
  const p = buildComposePrompt({
    instruction: 'put this under the board section',
    document: 'x',
    context: '',
    truncated: [],
    headings: [],
    passage: { title: 'דוח דירקטוריון Q1 2026 · עמוד 4', text: 'ההכנסות עמדו על 359 מיליון' },
  })
  assert.ok(p.includes('MARKED THIS PASSAGE'))
  assert.ok(p.includes('ההכנסות עמדו על 359 מיליון'))
  assert.ok(p.includes('דוח דירקטוריון Q1 2026 · עמוד 4'))
})

test('a partially-read file is named so the draft cannot lean on what it lacks', () => {
  const p = buildComposePrompt({
    instruction: 'summarise the call',
    document: '',
    context: 'partial',
    truncated: ['a very long call'],
    headings: [],
  })
  assert.ok(p.includes('only PART of these'))
  assert.ok(p.includes('a very long call'))
})
