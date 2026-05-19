import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerSupabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireSession() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('watchlist')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const postSchema = z.object({
  ticker: z.string().min(1).max(100).transform(v => v.toUpperCase()),
  companyName: z.string().min(1).max(100),
})

export async function POST(req: NextRequest) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ticker, companyName } = parsed.data

  const { data, error } = await supabaseAdmin
    .from('watchlist')
    .insert({
      user_id: session.user.id,
      ticker,
      company_name: companyName,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'הנייר כבר במעקב' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

const deleteSchema = z.object({
  ticker: z.string().min(1).max(100),
})

export async function DELETE(req: NextRequest) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('watchlist')
    .delete()
    .eq('user_id', session.user.id)
    .eq('ticker', parsed.data.ticker)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
