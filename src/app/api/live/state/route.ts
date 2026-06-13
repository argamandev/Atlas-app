import { NextResponse } from 'next/server'

// Same-origin bridge to the live broadcast engine (the spike server, or — in full production —
// the on-platform ingest). Keeps the browser same-origin (no CORS) and lets us point the deploy
// at a tunnelled local engine via LIVE_ENGINE_URL. Returns a graceful "offline" state if the
// engine isn't reachable, so the live page can show "connecting…" instead of erroring.
const ENGINE = process.env.LIVE_ENGINE_URL || 'http://localhost:8788'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(`${ENGINE}/state`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`engine ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({
      audioStartRel: null,
      liveEdgeRel: null,
      liveEnded: false,
      sampleRate: 16000,
      lines: [],
      offline: true,
    })
  }
}
