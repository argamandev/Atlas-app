import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const highlightSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
})

// Lenient — real/legacy data has role "unknown" and empty/null optional fields.
// We keep a structural sanity check but accept the data as stored.
const speakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  title: z.string().optional().nullable(),
  affiliation: z.string().optional().nullable(),
}).passthrough()

const lineSchema = z.object({
  id: z.string(),
  speakerId: z.string(),
  timestamp: z.string(),
  text: z.string(),
  highlights: z.array(highlightSchema).optional(),
}).passthrough()

const transcriptSchema = z.object({
  id: z.string(),
  company: z.string(),
  ticker: z.string().optional().nullable(),
  quarter: z.string(),
  date: z.string(),
  duration: z.string(),
  youtubeUrl: z.string().optional().nullable(),
  status: z.string(),
  createdAt: z.string(),
  speakers: z.array(speakerSchema),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    lines: z.array(lineSchema),
  }).passthrough()),
}).passthrough()

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch the row owner — authorization gate (we use supabaseAdmin which bypasses RLS)
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('transcripts')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  let canEdit = session.user.id === row.user_id
  if (!canEdit) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    canEdit = profile?.role === 'admin'
  }
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = transcriptSchema.safeParse(body?.formatted_data ?? body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid transcript data' }, { status: 400 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('transcripts')
    .update({ formatted_data: parsed.data })
    .eq('id', params.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
