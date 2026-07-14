import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentBlock } from './documentBlock'

test('labels the block with title, quarter and page numbers', () => {
  const block = buildDocumentBlock({ title: 'דוח רבעוני', quarter: 'Q2 2026' }, [
    { pageNo: 3, text: 'טקסט של עמוד שלוש' },
  ])
  assert.ok(block.includes('=== REPORT CONTEXT'))
  assert.ok(block.includes('דוח רבעוני'))
  assert.ok(block.includes('Q2 2026'))
  assert.ok(block.includes('[page 3]'))
  assert.ok(block.includes('טקסט של עמוד שלוש'))
})

test('degraded path: no pages → empty string (chat proceeds on passage + transcript)', () => {
  assert.equal(buildDocumentBlock({ title: 'x', quarter: 'y' }, []), '')
  assert.equal(buildDocumentBlock(null, [{ pageNo: 1, text: 't' }]), '')
})

test('multiple pages come out in order and are size-capped', () => {
  const big = 'א'.repeat(30_000)
  const block = buildDocumentBlock({ title: 't', quarter: 'q' }, [
    { pageNo: 1, text: big },
    { pageNo: 2, text: big },
  ])
  assert.ok(block.indexOf('[page 1]') < block.indexOf('[page 2]'))
  assert.ok(block.length <= 25_000 + 200) // MAX_DOC_CONTEXT_CHARS + label slack
})
