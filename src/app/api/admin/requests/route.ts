import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  return profile?.role === 'admin' ? session : null
}

// GET — list all pending requests
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('access_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — approve or reject a request
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId, action } = await req.json() as { requestId: string; action: 'approve' | 'reject' }

  // Fetch the request
  const { data: accessReq, error: fetchErr } = await supabaseAdmin
    .from('access_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchErr || !accessReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (action === 'approve') {
    // Send invite email via Supabase Auth
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      accessReq.email,
      {
        data: {
          first_name: accessReq.first_name,
          last_name: accessReq.last_name,
          role: 'user',
        },
      }
    )
    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  // Update request status
  await supabaseAdmin
    .from('access_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.id,
    })
    .eq('id', requestId)

  return NextResponse.json({ ok: true })
}
