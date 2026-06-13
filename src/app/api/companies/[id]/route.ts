import { NextRequest, NextResponse } from 'next/server'
import { getCompany } from '@/lib/db/companies'
import { listCompanyCalls } from '@/lib/db/calls'

// GET /api/companies/:id — a company profile + its investor calls (newest first).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const company = await getCompany(params.id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const calls = await listCompanyCalls(params.id)
    return NextResponse.json({ company, calls })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
