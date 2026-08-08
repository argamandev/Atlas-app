import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diffBlocks,
  blocksToHtml,
  blocksToText,
  blockHeadings,
  fragmentToDrafts,
  domToBlocks,
  type DocBlock,
  type DraftBlock,
} from './blocks'

const block = (over: Partial<DocBlock> & { id: string }): DocBlock => ({
  kind: 'text',
  body: '',
  position: 0,
  source_item_id: null,
  source_label: null,
  source_page: null,
  source_line_id: null,
  source_quote: null,
  ...over,
})

const dr = (over: Partial<DraftBlock>): DraftBlock => ({
  id: null,
  kind: 'text',
  body: '',
  position: 0,
  ...over,
})

// ── the diff ─────────────────────────────────────────────────────────────────

test('an untouched document produces no work', () => {
  const prev = [block({ id: 'a', body: 'one' }), block({ id: 'b', body: 'two', position: 1 })]
  const next = [dr({ id: 'a', body: 'one' }), dr({ id: 'b', body: 'two', position: 1 })]
  assert.deepEqual(diffBlocks(prev, next), [])
})

test('typing in one paragraph patches THAT paragraph and nothing else', () => {
  const prev = [block({ id: 'a', body: 'one' }), block({ id: 'b', body: 'two', position: 1 })]
  const next = [dr({ id: 'a', body: 'one!' }), dr({ id: 'b', body: 'two', position: 1 })]
  assert.deepEqual(diffBlocks(prev, next), [{ op: 'update', id: 'a', body: 'one!' }])
})

test('a new paragraph is created, and the ones after it move down', () => {
  const prev = [block({ id: 'a', body: 'one' }), block({ id: 'b', body: 'two', position: 1 })]
  const next = [dr({ id: 'a', body: 'one' }), dr({ body: 'new' }), dr({ id: 'b', body: 'two' })]
  const ops = diffBlocks(prev, next)
  assert.deepEqual(ops, [
    { op: 'update', id: 'b', position: 2 },
    { op: 'create', draftIndex: 1, kind: 'text', body: 'new', position: 1 },
  ])
})

test('a deleted paragraph is deleted, even when it was the last one', () => {
  const prev = [block({ id: 'a' }), block({ id: 'b', position: 1 })]
  assert.deepEqual(diffBlocks(prev, [dr({ id: 'a' })]), [{ op: 'delete', id: 'b' }])
  assert.deepEqual(diffBlocks(prev, []), [
    { op: 'delete', id: 'a' },
    { op: 'delete', id: 'b' },
  ])
})

test('reordering rewrites positions from the order on screen', () => {
  const prev = [block({ id: 'a', position: 0 }), block({ id: 'b', position: 1 })]
  const next = [dr({ id: 'b' }), dr({ id: 'a' })]
  assert.deepEqual(diffBlocks(prev, next), [
    { op: 'update', id: 'b', position: 0 },
    { op: 'update', id: 'a', position: 1 },
  ])
})

// A quote's citation is not patchable by design, so a kind change cannot be an
// update — it has to lose the anchor rather than keep one the words no longer
// stand behind.
test('changing a block’s kind replaces it instead of silently keeping the citation', () => {
  const prev = [
    block({ id: 'a', kind: 'quote', body: 'said it', source_item_id: 'i1', source_quote: 'said it' }),
  ]
  const next = [dr({ id: 'a', kind: 'text', body: 'said it' })]
  assert.deepEqual(diffBlocks(prev, next), [
    { op: 'delete', id: 'a' },
    { op: 'create', draftIndex: 0, kind: 'text', body: 'said it', position: 0 },
  ])
})

// ── a citation that lost its source ──────────────────────────────────────────
//
// The rule is enforced by the round trip, not by a helper: a block that kept
// its label and lost its item is marked `data-citation="missing"` on the way
// out and read back as a QUOTE on the way in, so the first autosave after
// removing a file cannot quietly turn the evidence into an ordinary paragraph.
// See the round-trip test below, which covers exactly that row.

test('a released citation survives a save as a quote, keeping its words', () => {
  const orphan = block({
    id: 'o',
    kind: 'quote',
    body: 'orphaned words',
    source_item_id: null,
    source_label: 'Q3 2025',
    source_quote: 'orphaned words',
  })
  const html = blocksToHtml([orphan])
  assert.match(html, /data-citation="missing"/)
  // …and reading that element back must NOT call it a paragraph, because a kind
  // change is a delete plus a create, and the new row would carry no source.
  const el = {
    tagName: 'BLOCKQUOTE',
    innerHTML: 'orphaned words',
    textContent: 'orphaned words',
    getAttribute: (k: string) => (k === 'data-block-id' ? 'o' : k === 'data-citation' ? 'missing' : null),
  }
  const back = domToBlocks({ children: [el] as unknown as ArrayLike<Element> })
  assert.equal(back[0].kind, 'quote')
  assert.deepEqual(diffBlocks([orphan], back), [])
})

// ── rendering ────────────────────────────────────────────────────────────────

test('blocks render in position order, carrying their ids', () => {
  const html = blocksToHtml([
    block({ id: 'b', body: 'second', position: 1 }),
    block({ id: 'a', kind: 'heading', body: 'Title', position: 0 }),
  ])
  assert.equal(html, '<h2 data-block-id="a">Title</h2><p data-block-id="b">second</p>')
})

test('a block whose source was REMOVED is marked, so the citation cannot look live', () => {
  const html = blocksToHtml([
    block({
      id: 'q',
      kind: 'quote',
      body: 'words',
      source_item_id: null,
      source_label: 'Q3 2025',
      source_quote: 'words',
    }),
  ])
  assert.equal(html, '<blockquote data-block-id=\"q\" data-citation=\"missing\">words</blockquote>')
})

test('a cited block carries its source on the element, so the diff can read the kind back', () => {
  const html = blocksToHtml([
    block({ id: 'q', kind: 'quote', body: 'words', source_item_id: 'i1', source_quote: 'words' }),
  ])
  assert.equal(html, '<blockquote data-block-id="q" data-source-item="i1">words</blockquote>')
})

test('text and headings are read back out for the model', () => {
  const bs = [
    block({ id: 'a', kind: 'heading', body: 'Findings', position: 0 }),
    block({ id: 'b', body: '<strong>Margins</strong> improved', position: 1 }),
  ]
  assert.equal(blocksToText(bs), 'Findings\n\nMargins improved')
  assert.deepEqual(blockHeadings(bs), ['Findings'])
})

// ── a composed fragment becomes several blocks ───────────────────────────────

// BODY IS THE BLOCK'S CONTENTS, not the block. `domToBlocks` reads
// `el.innerHTML` and `blocksToHtml` supplies the wrapper, so a body that
// carried its own `<p>` produced `<p><p>one</p></p>` — which the parser splits
// into an empty block plus an orphan, and the next save deleted the row.
test('an answer of several paragraphs is several blocks, not one lump', () => {
  const ds = fragmentToDrafts('<p>one</p><p>two</p>', 0)
  assert.deepEqual(
    ds.map((d) => [d.kind, d.body, d.position]),
    [
      ['text', 'one', 0],
      ['text', 'two', 1],
    ]
  )
})

// The property that all of this exists to guarantee: what the seed writes into
// the editor must read back as the SAME blocks, or every save churns rows.
test('ROUND TRIP: rows → html → rows is stable for every kind', () => {
  const rows = [
    block({ id: 'h', kind: 'heading', body: 'Findings', position: 0 }),
    block({ id: 'p', kind: 'text', body: 'a <strong>bold</strong> claim', position: 1 }),
    block({ id: 'l', kind: 'text', body: '<ul><li>one</li></ul>', position: 2 }),
    block({ id: 't', kind: 'text', body: '<table><tr><td>1</td></tr></table>', position: 3 }),
    block({
      id: 'q',
      kind: 'quote',
      body: 'the words',
      position: 4,
      source_item_id: 'i1',
      source_quote: 'the words',
    }),
    block({
      id: 'o',
      kind: 'quote',
      body: 'orphaned words',
      position: 5,
      source_item_id: null,
      source_label: 'Q3 2025',
      source_quote: 'orphaned words',
    }),
  ]
  const html = blocksToHtml(rows)
  // Parse it the way the browser would, using the element shim these tests use.
  const parsed = html.match(/<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g) ?? []
  assert.equal(parsed.length, rows.length, `expected ${rows.length} top-level blocks, got ${parsed.length}`)
  const children = parsed.map((el) => {
    const tag = /^<(\w+)/.exec(el)![1].toUpperCase()
    const attrs: Record<string, string> = {}
    for (const m of el.slice(0, el.indexOf('>')).matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2]
    const body = el.slice(el.indexOf('>') + 1, el.lastIndexOf('</'))
    return {
      tagName: tag,
      innerHTML: body,
      textContent: body.replace(/<[^>]*>/g, ''),
      getAttribute: (k: string) => attrs[k] ?? null,
    }
  })
  const back = domToBlocks({ children: children as unknown as ArrayLike<Element> })
  assert.deepEqual(
    back.map((b) => [b.id, b.kind, b.body]),
    rows.map((b) => [b.id, b.kind, b.body])
  )
  // …and therefore the diff has nothing to do, which is the whole point.
  assert.deepEqual(diffBlocks(rows, back), [])
})

test('a heading in the answer becomes a heading block, unwrapped', () => {
  const ds = fragmentToDrafts('<h2>Summary</h2><p>body</p>', 3)
  assert.deepEqual(
    ds.map((d) => [d.kind, d.body, d.position]),
    [
      ['heading', 'Summary', 3],
      ['text', 'body', 4],
    ]
  )
})

test('a table stays one block and keeps its markup', () => {
  const ds = fragmentToDrafts('<table><tr><td>1</td></tr></table>', 0)
  assert.equal(ds.length, 1)
  assert.equal(ds[0].kind, 'text')
  assert.match(ds[0].body, /^<table>/)
})

test('loose text between blocks is kept rather than dropped', () => {
  const ds = fragmentToDrafts('stray<p>one</p>tail', 0)
  assert.deepEqual(
    ds.map((d) => d.body),
    ['stray', 'one', 'tail']
  )
})

// ── reading the DOM ──────────────────────────────────────────────────────────

const fakeEl = (tag: string, html: string, attrs: Record<string, string> = {}) => ({
  tagName: tag,
  innerHTML: html,
  textContent: html.replace(/<[^>]*>/g, ''),
  getAttribute: (k: string) => attrs[k] ?? null,
})

test('the DOM reads back as blocks, with new children carrying no id', () => {
  const root = {
    children: [
      fakeEl('H2', 'Title', { 'data-block-id': 'a' }),
      fakeEl('P', 'body', { 'data-block-id': 'b' }),
      fakeEl('P', 'just typed'),
    ] as unknown as ArrayLike<Element>,
  }
  assert.deepEqual(domToBlocks(root), [
    { id: 'a', kind: 'heading', body: 'Title', position: 0 },
    { id: 'b', kind: 'text', body: 'body', position: 1 },
    { id: null, kind: 'text', body: 'just typed', position: 2 },
  ])
})

// The database refuses a quote without its words, so an indented paragraph the
// analyst typed must NOT be called one.
test('a blockquote without a citation is text, because `quote` means CITED', () => {
  const root = {
    children: [
      fakeEl('BLOCKQUOTE', 'my own aside'),
      fakeEl('BLOCKQUOTE', 'they said', { 'data-source-item': 'i1', 'data-block-id': 'q' }),
    ] as unknown as ArrayLike<Element>,
  }
  assert.deepEqual(
    domToBlocks(root).map((b) => b.kind),
    ['text', 'quote']
  )
})

test('an empty paragraph is the caret resting, not content to save', () => {
  const root = {
    children: [fakeEl('P', ''), fakeEl('P', '<br>'), fakeEl('P', 'real')] as unknown as ArrayLike<Element>,
  }
  assert.deepEqual(
    domToBlocks(root).map((b) => b.body),
    ['real']
  )
})

test('a figure with no text is still content', () => {
  const root = {
    children: [fakeEl('P', '<img src="data:image/png;base64,x">')] as unknown as ArrayLike<Element>,
  }
  assert.equal(domToBlocks(root).length, 1)
})

// THE CITATION HAS TO REACH THE CREATE CALL, or the database refuses the row.
//
// `kind: 'quote'` was being set on the draft while the citation itself was left
// behind, so the POST carried no `source_quote` — and the CHECK constraint
// `kind <> 'quote' or source_quote is not null` rejected it. The quote the
// analyst had just asked for disappeared between the card and the row.
test('a quote draft carries its source through the diff into the create op', () => {
  const citation = {
    source_item_id: 'item-1',
    source_label: 'תיגבור — Q3 2025',
    source_quote: 'the words as spoken',
    source_line_id: 'L0004',
  }
  const ops = diffBlocks([], [dr({ kind: 'quote', body: 'the words as spoken', citation })])
  assert.deepEqual(ops, [
    {
      op: 'create',
      draftIndex: 0,
      kind: 'quote',
      body: 'the words as spoken',
      position: 0,
      citation,
    },
  ])
})

test('an ordinary paragraph carries no citation, so none is sent', () => {
  const ops = diffBlocks([], [dr({ body: 'just text' })])
  assert.equal('citation' in (ops[0] as Record<string, unknown>), false)
})
