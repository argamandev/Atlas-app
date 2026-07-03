// Wrap raw PCM (s16le mono) in a minimal WAV container — enough for whisper/ffmpeg to read.
export function pcmToWav(pcm: Buffer, sampleRate = 16000): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28) // byte rate (16-bit mono)
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
