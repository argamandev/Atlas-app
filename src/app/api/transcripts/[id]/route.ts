import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  console.log(`[GET /api/transcripts/${params.id}] querying supabase...`)
  const { data: rows, error } = await supabaseAdmin
    .from('transcripts')
    .select('*')
    .eq('id', params.id)
    .limit(1)
  console.log(`[GET /api/transcripts/${params.id}] result: rows=${JSON.stringify(rows)}, error=${JSON.stringify(error)}`)
  const data = rows?.[0] ?? null

  if (error) {
    console.error(`[GET /api/transcripts/${params.id}] supabase error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
