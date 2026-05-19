import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase, supabaseAdmin } from '@/lib/supabase'
import { TA125_SEED } from '@/lib/ta125-seed'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? ''
  if (!q) return NextResponse.json([])

  const seedHits = TA125_SEED.filter(
    (c) =>
      c.ticker.toLowerCase().includes(q) ||
      c.nameHe.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q)
  )

  const { data: seenRows } = await supabaseAdmin
    .from('seen_reports')
    .select('company_name')
    .ilike('company_name', `%${q}%`)
    .limit(20)

  const seenSet = new Set<string>()
  const seenHits = (seenRows ?? [])
    .map((r) => r.company_name)
    .filter((name) => {
      const key = name.toLowerCase()
      if (seenSet.has(key)) return false
      seenSet.add(key)
      return true
    })
    .map((name) => ({ ticker: name, nameHe: name, nameEn: '' }))

  const merged: { ticker: string; nameHe: string; nameEn: string }[] = []
  const mergedKeys = new Set<string>()
  for (const item of [...seedHits, ...seenHits]) {
    const key = item.nameHe.toLowerCase()
    if (mergedKeys.has(key)) continue
    mergedKeys.add(key)
    merged.push(item)
  }

  return NextResponse.json(merged.slice(0, 8))
}
