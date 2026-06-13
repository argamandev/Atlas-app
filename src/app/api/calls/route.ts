import { NextRequest, NextResponse } from 'next/server'
import { listCalls } from '@/lib/db/calls'

// GET /api/calls?scope=all|upcoming|live&companyId=<id>
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const scope = (sp.get('scope') as 'all' | 'upcoming' | 'live' | null) ?? 'all'
    const companyId = sp.get('companyId') ?? undefined
    const calls = await listCalls({ scope, companyId })
    return NextResponse.json(calls)
  } catch (err) {
    console.error('[GET /api/calls]', (err as Error).message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
