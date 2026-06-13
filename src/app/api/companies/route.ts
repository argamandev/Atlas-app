import { NextRequest, NextResponse } from 'next/server'
import { listCompanies, searchCompanies } from '@/lib/db/companies'

// GET /api/companies?q=<search> — platform company directory (seeded V1 data layer).
export async function GET(req: NextRequest) {
  try {
    const q = new URL(req.url).searchParams.get('q') ?? ''
    const companies = q ? await searchCompanies(q) : await listCompanies()
    return NextResponse.json(companies)
  } catch (err) {
    console.error('[GET /api/companies]', (err as Error).message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
