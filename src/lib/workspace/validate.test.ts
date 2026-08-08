import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWorkspaceCreate,
  parseWorkspacePatch,
  parseItemCreate,
  parseItemPatch,
  parseBlockCreate,
  parseBlockPatch,
  parseRemoteSource,
  WS_NAME_MAX,
  WS_BODY_MAX,
} from './validate'

test('a workspace needs a non-empty name', () => {
  assert.equal(parseWorkspaceCreate({ name: '' }).ok, false)
  assert.equal(parseWorkspaceCreate({ name: '   ' }).ok, false)
  assert.equal(parseWorkspaceCreate({}).ok, false)
  assert.equal(parseWorkspaceCreate(null).ok, false)
  assert.equal(parseWorkspaceCreate({ name: 'a'.repeat(WS_NAME_MAX + 1) }).ok, false)
})

test('a name is trimmed rather than stored with its whitespace', () => {
  const ok = parseWorkspaceCreate({ name: '  תגבור — הפרטה  ' })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.name, 'תגבור — הפרטה')
})

test('ownership cannot be reassigned through a patch', () => {
  // user_id is not an editable field, so a body carrying only that is refused
  // outright rather than applying nothing and reporting success.
  assert.equal(parseWorkspacePatch({ user_id: 'someone-else' }).ok, false)
  assert.equal(parseWorkspacePatch({}).ok, false)
  assert.equal(parseWorkspacePatch(null).ok, false)
})

test('a workspace patch accepts exactly name and doc_title', () => {
  const p = parseWorkspacePatch({ name: 'x', doc_title: 'what we know' })
  assert.deepEqual(p.ok && p.value, { name: 'x', doc_title: 'what we know' })
  // Clearing the document title is a real edit, so an empty string is allowed
  // where an empty NAME is not.
  assert.equal(parseWorkspacePatch({ doc_title: '' }).ok, true)
  assert.equal(parseWorkspacePatch({ name: '' }).ok, false)
})

test('an item carries EXACTLY ONE provenance', () => {
  // The database has a CHECK for this; refusing here turns a 500 into a 400
  // with a sentence the UI can actually render.
  assert.equal(parseItemCreate({ kind: 'transcript', name: 'x' }).ok, false)
  assert.equal(
    parseItemCreate({ kind: 'transcript', name: 'x', transcript_id: 't1', document_id: 'd1' }).ok,
    false
  )
  const ok = parseItemCreate({ kind: 'transcript', name: 'Q4 call', transcript_id: 't1' })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.transcript_id, 't1')
  assert.equal(ok.ok && ok.value.document_id, undefined)
})

test('the provenance must MATCH the declared kind', () => {
  // A row claiming to be a transcript while holding a document id would render
  // the wrong icon and resolve its citations against the wrong source — a page
  // anchor against a call, or a line id against a PDF.
  assert.equal(parseItemCreate({ kind: 'transcript', name: 'x', document_id: 'd1' }).ok, false)
  assert.equal(parseItemCreate({ kind: 'document', name: 'x', transcript_id: 't1' }).ok, false)
  assert.equal(parseItemCreate({ kind: 'file', name: 'x', transcript_id: 't1' }).ok, false)
  assert.equal(parseItemCreate({ kind: 'nonsense', name: 'x', transcript_id: 't1' }).ok, false)
})

test('every provenance kind round-trips', () => {
  const t = parseItemCreate({ kind: 'transcript', name: 'call', transcript_id: 't1' })
  assert.equal(t.ok && t.value.transcript_id, 't1')
  const d = parseItemCreate({ kind: 'document', name: 'report', document_id: 'd1' })
  assert.equal(d.ok && d.value.document_id, 'd1')
  const f = parseItemCreate({ kind: 'file', name: 'notes.pdf', storage_path: 'u/1.pdf' })
  assert.equal(f.ok && f.value.storage_path, 'u/1.pdf')
})

test('layout is the only thing an item patch may change', () => {
  assert.equal(parseItemPatch({ transcript_id: 'other' }).ok, false)
  assert.equal(parseItemPatch({ name: 'renamed' }).ok, false)
  assert.equal(parseItemPatch({}).ok, false)
  assert.equal(parseItemPatch({ position: -1 }).ok, false)
  assert.equal(parseItemPatch({ position: 1.5 }).ok, false)
  assert.equal(parseItemPatch({ is_open: 'yes' }).ok, false)
  const ok = parseItemPatch({ is_open: true, position: 3 })
  assert.deepEqual(ok.ok && ok.value, { is_open: true, position: 3 })
})

test('closing a source is a real patch, not an empty one', () => {
  // `is_open: false` is falsy; a naive truthiness check would drop it and the
  // route would answer "saved" having changed nothing.
  const ok = parseItemPatch({ is_open: false })
  assert.deepEqual(ok.ok && ok.value, { is_open: false })
})

test('a quote block without its quoted text is refused', () => {
  // Mirrors the DB CHECK. Without the snapshot there is nothing to detect drift
  // against, so a re-processed transcript would let the citation resolve to the
  // wrong words while still looking correct.
  assert.equal(parseBlockCreate({ kind: 'quote', body: 'x', position: 0 }).ok, false)
  assert.equal(parseBlockCreate({ kind: 'quote', body: 'x', position: 0, source_quote: '   ' }).ok, false)
  const ok = parseBlockCreate({
    kind: 'quote',
    body: 'x',
    position: 0,
    source_quote: 'הכנסות עלו',
    source_line_id: 'L0004',
    source_item_id: 'i1',
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.source_line_id, 'L0004')
})

test('a block anchors to a page OR a line, never both', () => {
  assert.equal(
    parseBlockCreate({
      kind: 'quote',
      body: 'x',
      position: 0,
      source_quote: 'q',
      source_page: 14,
      source_line_id: 'L0004',
    }).ok,
    false
  )
})

test('page zero is a legitimate anchor and is not dropped', () => {
  // 0 is falsy; a truthiness check would silently discard the anchor and store
  // a citation pointing at nothing in particular.
  const ok = parseBlockCreate({
    kind: 'quote',
    body: 'x',
    position: 0,
    source_quote: 'q',
    source_page: 0,
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.source_page, 0)
})

test('heading and text blocks need no citation', () => {
  assert.equal(parseBlockCreate({ kind: 'heading', body: 'Findings' }).ok, true)
  assert.equal(parseBlockCreate({ kind: 'text', body: '' }).ok, true)
  assert.equal(parseBlockCreate({ kind: 'sidebar', body: 'x' }).ok, false)
})

test('oversized input is refused rather than silently truncated', () => {
  assert.equal(parseBlockCreate({ kind: 'text', body: 'a'.repeat(WS_BODY_MAX + 1) }).ok, false)
  assert.equal(parseBlockPatch({ body: 'a'.repeat(WS_BODY_MAX + 1) }).ok, false)
})

test('an empty block body is a legitimate edit', () => {
  const ok = parseBlockPatch({ body: '' })
  assert.deepEqual(ok.ok && ok.value, { body: '' })
  assert.equal(parseBlockPatch({}).ok, false)
})

// ── parseRemoteSource — the branch's security boundary ───────────────────────
// It had no test at all until review pointed that out. Everything that keeps a
// browser from naming a company for every member of a shared corpus, or from
// pointing the server at an address of its choosing, is enforced here.
test('a MAYA pointer accepts only which filing is meant', () => {
  const ok = parseRemoteSource({ mayaReportId: 1655039, issuerId: 1460, publishedISO: '2025-03-30T15:55:59.78' })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.deepEqual(ok.value, {
      mayaReportId: 1655039,
      issuerId: 1460,
      publishedISO: '2025-03-30T15:55:59.78',
    })
  }
})

// NO CONTENT MAY CROSS. A title or issuer name from a browser would become a row
// every member sees; a URL would be a fetch of the caller's choosing.
test('content and URLs supplied by the caller are discarded, not merely unused', () => {
  const r = parseRemoteSource({
    mayaReportId: 1,
    issuerId: 1,
    title: 'a title the caller chose',
    issuerName: 'a company the caller invented',
    pdfUrl: 'https://evil.example.com/x.pdf',
    docType: 'report',
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(Object.keys(r.value).sort(), ['issuerId', 'mayaReportId', 'publishedISO'])
    assert.ok(!('pdfUrl' in r.value))
    assert.ok(!('title' in r.value))
    assert.ok(!('issuerName' in r.value))
  }
})

test('an unusable pointer is refused rather than defaulted', () => {
  for (const bad of [
    null,
    {},
    { mayaReportId: 0, issuerId: 1 },
    { mayaReportId: -5, issuerId: 1 },
    { mayaReportId: 1.5, issuerId: 1 },
    { mayaReportId: 1, issuerId: 0 },
    { mayaReportId: 1, issuerId: 100000 },
    { mayaReportId: 'x', issuerId: 1 },
  ]) {
    assert.equal(parseRemoteSource(bad).ok, false, `${JSON.stringify(bad)} must be refused`)
  }
})

test('an unparseable date hint becomes null rather than an invalid year', () => {
  const r = parseRemoteSource({ mayaReportId: 1, issuerId: 1, publishedISO: 'not a date' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.publishedISO, null)
})
