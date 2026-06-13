import { NextRequest, NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/auth'
import { listQuotes, createQuote } from '@/lib/db/quotes'
import { DEMO_USER_ID } from '@/lib/api/types'

// GET /api/quotes?companyId=<id> — the user's saved quotes.
export async function GET(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const companyId = new URL(req.url).searchParams.get('companyId') ?? undefined
  const quotes = await listQuotes(userId, companyId)
  return NextResponse.json(quotes)
}

// POST /api/quotes — save a quote selected from a transcript ("My Quotes").
export async function POST(req: NextRequest) {
  const userId = (await getRequestUserId(req)) ?? DEMO_USER_ID
  const body = await req.json().catch(() => null)
  if (!body?.text || !body?.companyId) {
    return NextResponse.json({ error: 'text and companyId required' }, { status: 400 })
  }
  const quote = await createQuote(userId, {
    companyId: String(body.companyId),
    transcriptId: body.transcriptId ?? null,
    text: String(body.text),
    speaker: body.speaker ?? null,
    quarter: body.quarter ?? null,
    startSec: typeof body.startSec === 'number' ? body.startSec : null,
  })
  return NextResponse.json(quote, { status: 201 })
}
