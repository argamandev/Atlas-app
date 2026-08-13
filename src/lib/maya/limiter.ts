// ─────────────────────────────────────────────────────────────────────────────
// THE GLOBAL MAYA LIMITER (ingestion standard §7, LAW).
//
// 10 requests / 2 seconds is ONE budget for the whole key — every user, every
// consumer, every background sweep. Until slice A3 the pacing was per call site
// (`MAYA_MIN_REQUEST_GAP_MS` inside loops), so two concurrent consumers each
// got their own gap and the KEY still overran. This limiter is process-global
// and lives at the `client.ts` chokepoint, so no MAYA request can bypass it —
// a scheduled sweep and a user click share one queue by construction.
//
// Sliding window, serialized: acquires resolve in arrival order, each waiting
// until the last `max` sends no longer fill the window. A 429 that still
// happens (another process, clock skew) stays SURFACED by the client as
// `rate_limited` — never silently retried forever.
//
// `mayafiles.tase.co.il` downloads (PDFs, XBRL, logos) are unmetered and do
// NOT go through this — the budget belongs to datawise.tase.co.il alone.
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class SlidingWindowLimiter {
  private stamps: number[] = []
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  /** Resolves when the caller may send. FIFO across the whole process. */
  acquire(): Promise<void> {
    const turn = this.tail.then(async () => {
      const prune = () => {
        const cutoff = Date.now() - this.windowMs
        while (this.stamps.length && this.stamps[0] <= cutoff) this.stamps.shift()
      }
      prune()
      while (this.stamps.length >= this.max) {
        await sleep(Math.max(1, this.stamps[0] + this.windowMs - Date.now()))
        prune()
      }
      this.stamps.push(Date.now())
    })
    // The chain must survive a rejected turn (there is none today, but a queue
    // that dies once and blocks every later caller would be a silent outage).
    this.tail = turn.catch(() => {})
    return turn
  }
}

// Process-global on purpose — and via globalThis, so Next's separate RSC and
// route-handler module layers in dev share ONE window (the quotes.ts pattern).
const g = globalThis as unknown as { __atlasMayaLimiter?: SlidingWindowLimiter }
export const mayaLimiter = (g.__atlasMayaLimiter ??= new SlidingWindowLimiter(10, 2000))
