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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
