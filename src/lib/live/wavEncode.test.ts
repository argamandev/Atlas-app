import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pcmToWav } from './wavEncode'

test('wav is 44-byte header + payload, with correct magics', () => {
  const pcm = Buffer.alloc(32000) // 1s of silence @16k mono s16le
  const wav = pcmToWav(pcm)
  assert.equal(wav.length, 44 + 32000)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ')
  assert.equal(wav.toString('ascii', 36, 40), 'data')
})

test('wav header fields encode 16k mono s16le and the payload size', () => {
  const pcm = Buffer.alloc(64000) // 2s
  const wav = pcmToWav(pcm)
  assert.equal(wav.readUInt32LE(4), 36 + 64000) // RIFF size
  assert.equal(wav.readUInt16LE(20), 1) // PCM
  assert.equal(wav.readUInt16LE(22), 1) // mono
  assert.equal(wav.readUInt32LE(24), 16000) // sample rate
  assert.equal(wav.readUInt32LE(28), 32000) // byte rate
  assert.equal(wav.readUInt16LE(32), 2) // block align
  assert.equal(wav.readUInt16LE(34), 16) // bits per sample
  assert.equal(wav.readUInt32LE(40), 64000) // data size
})

test('payload bytes pass through untouched', () => {
  const pcm = Buffer.from([1, 2, 3, 4])
  assert.deepEqual([...pcmToWav(pcm).subarray(44)], [1, 2, 3, 4])
})
