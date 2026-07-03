// Incremental silence-aligned chunker over s16le mono PCM. Accumulates fed bytes, scans
// fixed 100ms windows for RMS energy, and cuts a chunk when (a) >= minChunkSec buffered AND
// a sustained quiet run just ended a sentence, or (b) maxChunkSec is reached. Pure: no IO,
// no clocks — startSec/endSec are relative to the first fed byte.
export interface PcmChunk {
  pcm: Buffer
  startSec: number
  endSec: number
  reason: 'silence' | 'max' | 'flush'
}
export interface ChunkerOpts {
  sampleRate?: number
  minChunkSec?: number
  maxChunkSec?: number
  silenceMs?: number
  silenceRms?: number // 0..1 of full scale
}

const WINDOW_MS = 100

export class PcmChunker {
  private readonly bytesPerSec: number
  private readonly windowBytes: number
  private readonly minSec: number
  private readonly maxSec: number
  private readonly quietWindowsNeeded: number
  private readonly rmsThreshold: number
  private buf = Buffer.alloc(0)
  private scanPos = 0 // next unscanned byte within buf (window-aligned)
  private quietRun = 0
  private emittedSec = 0

  constructor(opts: ChunkerOpts = {}) {
    const sr = opts.sampleRate ?? 16000
    this.bytesPerSec = sr * 2
    this.windowBytes = Math.round((sr * WINDOW_MS) / 1000) * 2
    this.minSec = opts.minChunkSec ?? 20
    this.maxSec = opts.maxChunkSec ?? 45
    this.quietWindowsNeeded = Math.max(1, Math.round((opts.silenceMs ?? 400) / WINDOW_MS))
    this.rmsThreshold = opts.silenceRms ?? 0.02
  }

  feed(incoming: Buffer): PcmChunk[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, incoming]) : Buffer.from(incoming)
    const out: PcmChunk[] = []
    while (this.scanPos + this.windowBytes <= this.buf.length) {
      let sumSq = 0
      const samples = this.windowBytes / 2
      for (let i = 0; i < this.windowBytes; i += 2) {
        const s = this.buf.readInt16LE(this.scanPos + i) / 32768
        sumSq += s * s
      }
      const rms = Math.sqrt(sumSq / samples)
      this.quietRun = rms < this.rmsThreshold ? this.quietRun + 1 : 0
      this.scanPos += this.windowBytes
      const bufferedSec = this.scanPos / this.bytesPerSec
      if (bufferedSec >= this.minSec && this.quietRun >= this.quietWindowsNeeded) {
        out.push(this.cut(this.scanPos, 'silence'))
      } else if (bufferedSec >= this.maxSec) {
        out.push(this.cut(this.scanPos, 'max'))
      }
    }
    return out
  }

  flush(): PcmChunk | null {
    if (this.buf.length === 0) return null
    return this.cut(this.buf.length, 'flush')
  }

  private cut(atBytes: number, reason: PcmChunk['reason']): PcmChunk {
    const durSec = atBytes / this.bytesPerSec
    const chunk: PcmChunk = {
      pcm: Buffer.from(this.buf.subarray(0, atBytes)),
      startSec: this.emittedSec,
      endSec: this.emittedSec + durSec,
      reason,
    }
    this.buf = Buffer.from(this.buf.subarray(atBytes))
    this.scanPos = 0
    this.quietRun = 0
    this.emittedSec = chunk.endSec
    return chunk
  }
}
