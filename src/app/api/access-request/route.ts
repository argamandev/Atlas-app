import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { firstName, lastName, email } = await req.json()

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('access_requests')
    .insert({ first_name: firstName, last_name: lastName, email })

  if (error) {
    const code = error.code === '23505' ? 'duplicate' : 'db_error'
    return NextResponse.json({ error: error.message, code }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
