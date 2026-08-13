import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { unauthorized } from '@/lib/auth'
import { resolveUser } from '@/lib/auth/verifyUser'

export const dynamic = 'force-dynamic'

// Returns the verified user when they are an admin, else null. resolveUser()
// revalidates the token with Supabase — getSession() only re-read the cookie,
// which an attacker supplies.
async function requireAdmin() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)
  if (!user) return null

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()

  return profile?.role === 'admin' ? user : null
}

// GET — list all pending requests
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return unauthorized()

  const { data, error } = await supabaseAdmin
    .from('access_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — approve or reject a request
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return unauthorized()

  const { requestId, action } = (await req.json()) as { requestId: string; action: 'approve' | 'reject' }

  // Fetch the request
  const { data: accessReq, error: fetchErr } = await supabaseAdmin
    .from('access_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchErr || !accessReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (action === 'approve') {
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(accessReq.email, {
      data: {
        first_name: accessReq.first_name,
        last_name: accessReq.last_name,
        role: 'user',
      },
    })
    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  // Update request status. A refused write surfaces — otherwise the admin sees ok:true
  // while the request stays pending (supabase never throws; the error rides the result).
  const { error: updateErr } = await supabaseAdmin
    .from('access_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq('id', requestId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
