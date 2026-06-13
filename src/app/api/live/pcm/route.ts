import { NextRequest, NextResponse } from 'next/server'

// Proxies a raw-PCM time-window slice from the live engine (S16LE @ 16kHz). 204 = nothing yet
// for that window, 416 = out of range — both forwarded so the player can back off gracefully.
const ENGINE = process.env.LIVE_ENGINE_URL || 'http://localhost:8788'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  try {
    const res = await fetch(`${ENGINE}/pcm?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      cache: 'no-store',
    })
    if (res.status === 204 || res.status === 416) return new NextResponse(null, { status: res.status })
    if (!res.ok) return new NextResponse(null, { status: 502 })
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
