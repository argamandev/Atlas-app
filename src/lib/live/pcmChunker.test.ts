// src/lib/live/pcmChunker.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PcmChunker } from './pcmChunker'

const SR = 16000
// Synthetic s16le mono: "loud" = constant amplitude 8000, "quiet" = zeros.
function pcmOf(sec: number, amplitude: number): Buffer {
  const buf = Buffer.alloc(Math.round(sec * SR) * 2)
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(amplitude, i)
  return buf
}
// Small limits so tests stay fast: min 2s, max 4s, 400ms silence.
const opts = { minChunkSec: 2, maxChunkSec: 4, silenceMs: 400, silenceRms: 0.02 }

test('cuts at the first sustained silence after minChunkSec', () => {
  const c = new PcmChunker(opts)
  const chunks = [
    ...c.feed(pcmOf(2.5, 8000)), // speech past min
    ...c.feed(pcmOf(0.6, 0)), // pause
    ...c.feed(pcmOf(1.0, 8000)),
  ]
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].reason, 'silence')
  assert.equal(chunks[0].startSec, 0)
  assert.ok(chunks[0].endSec > 2.5 && chunks[0].endSec <= 3.1, `cut at ${chunks[0].endSec}`)
})

test('forces a cut at maxChunkSec when nobody pauses', () => {
  const c = new PcmChunker(opts)
  const chunks = c.feed(pcmOf(9, 8000))
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].reason, 'max')
  assert.equal(chunks[0].endSec, 4)
  assert.equal(chunks[1].startSec, 4)
  assert.equal(chunks[1].endSec, 8)
})

test('no silence cut before minChunkSec', () => {
  const c = new PcmChunker(opts)
  const chunks = [...c.feed(pcmOf(1, 8000)), ...c.feed(pcmOf(0.6, 0)), ...c.feed(pcmOf(0.2, 8000))]
  assert.equal(chunks.length, 0) // 1.8s total: under min, silence ignored
})

test('every fed byte lands in exactly one chunk, contiguously', () => {
  const c = new PcmChunker(opts)
  const feeds = [pcmOf(2.5, 8000), pcmOf(0.6, 0), pcmOf(4.5, 8000), pcmOf(1.3, 8000)]
  const fedBytes = feeds.reduce((n, b) => n + b.length, 0)
  const chunks = feeds.flatMap((b) => c.feed(b))
  const tail = c.flush()
  if (tail) chunks.push(tail)
  assert.equal(
    chunks.reduce((n, ch) => n + ch.pcm.length, 0),
    fedBytes
  )
  for (let i = 1; i < chunks.length; i++) assert.equal(chunks[i].startSec, chunks[i - 1].endSec)
  assert.equal(chunks[chunks.length - 1].reason, 'flush')
})

test('flush on an empty buffer returns null', () => {
  const c = new PcmChunker(opts)
  assert.equal(c.flush(), null)
})
