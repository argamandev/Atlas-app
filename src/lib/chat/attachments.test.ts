import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAttachments,
  snipCaption,
  geminiSnipParts,
  openAiSnipContent,
  ATTACHMENT_MAX,
  ATTACHMENT_MAX_B64,
} from './attachments'

const PNG = 'data:image/png;base64,'
const good = (n = 1) => ({ dataUrl: PNG + 'aGVsbG8=', page: n, documentId: 'doc-1' })

test('parseAttachments: passes valid snips through', () => {
  assert.deepEqual(parseAttachments([good(3)]), [{ dataUrl: PNG + 'aGVsbG8=', page: 3, documentId: 'doc-1' }])
})

test('parseAttachments: non-array and junk → empty', () => {
  assert.deepEqual(parseAttachments(undefined), [])
  assert.deepEqual(parseAttachments('x'), [])
  assert.deepEqual(parseAttachments([null, 42, {}]), [])
})

test('parseAttachments: rejects non-PNG data URLs, bad pages, missing doc', () => {
  assert.deepEqual(parseAttachments([{ ...good(), dataUrl: 'data:image/jpeg;base64,aa' }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), page: 0 }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), page: 1.5 }]), [])
  assert.deepEqual(parseAttachments([{ ...good(), documentId: '' }]), [])
})

test('parseAttachments: caps count at ATTACHMENT_MAX and size at ATTACHMENT_MAX_B64', () => {
  const six = [good(1), good(2), good(3), good(4), good(5), good(6)]
  assert.equal(parseAttachments(six).length, ATTACHMENT_MAX)
  const fat = { ...good(), dataUrl: PNG + 'a'.repeat(ATTACHMENT_MAX_B64 + 1) }
  assert.deepEqual(parseAttachments([fat]), [])
})

test('snipCaption: with and without document metadata', () => {
  assert.equal(snipCaption({ title: 'דוח רבעון 1 2026' }, 12), 'תצלום מעמוד 12 של דוח רבעון 1 2026')
  assert.equal(snipCaption(null, 5), 'תצלום מעמוד 5 מהדוח')
})

test('geminiSnipParts: inline_data + caption text per snip, prefix stripped', () => {
  const parts = geminiSnipParts([good(2)], ['cap'])
  assert.deepEqual(parts, [{ inline_data: { mime_type: 'image/png', data: 'aGVsbG8=' } }, { text: 'cap' }])
})

test('openAiSnipContent: caption text + image_url per snip, full data URL kept', () => {
  const parts = openAiSnipContent([good(2)], ['cap'])
  assert.deepEqual(parts, [
    { type: 'text', text: 'cap' },
    { type: 'image_url', image_url: { url: PNG + 'aGVsbG8=' } },
  ])
})
