import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('seen_reports')
    .select('report_id, company_name, report_url, publication_date, first_seen_at')
    .order('first_seen_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map((r) => ({
      reportId: r.report_id,
      companyName: r.company_name,
      reportUrl: r.report_url,
      publicationDate: r.publication_date,
      firstSeenAt: r.first_seen_at,
    }))
  )
}
