import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { resolveUser } from '@/lib/auth/verifyUser'

export const dynamic = 'force-dynamic'

const highlightSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
})

// Lenient — real/legacy data has role "unknown" and empty/null optional fields.
// We keep a structural sanity check but accept the data as stored.
const speakerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    title: z.string().optional().nullable(),
    affiliation: z.string().optional().nullable(),
  })
  .passthrough()

const lineSchema = z
  .object({
    id: z.string(),
    speakerId: z.string(),
    timestamp: z.string(),
    text: z.string(),
    highlights: z.array(highlightSchema).optional(),
  })
  .passthrough()

const transcriptSchema = z
  .object({
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
    sections: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          lines: z.array(lineSchema),
        })
        .passthrough()
    ),
  })
  .passthrough()

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()
  console.log(`[GET /api/transcripts/${params.id}] querying supabase...`)
  const { data: rows, error } = await supabaseAdmin
    .from('transcripts')
    .select('*')
    .eq('id', params.id)
    .limit(1)
  console.log(
    `[GET /api/transcripts/${params.id}] result: rows=${JSON.stringify(rows)}, error=${JSON.stringify(error)}`
  )
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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  // Fetch the row owner — authorization gate (we use supabaseAdmin which bypasses RLS)
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('transcripts')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  let canEdit = user.id === row.user_id
  if (!canEdit) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
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

// Admin gate shared by DELETE + PATCH: VERIFIED user → profiles.role === 'admin'.
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// DELETE — admin-only. Removes a transcript and tidies references.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied

  // Grab the audio URL for best-effort storage cleanup.
  const { data: row } = await supabaseAdmin
    .from('transcripts')
    .select('audio_url')
    .eq('id', params.id)
    .maybeSingle()

  // scheduled_calls.transcript_id has no ON DELETE rule → null it first or the delete is rejected.
  await supabaseAdmin.from('scheduled_calls').update({ transcript_id: null }).eq('transcript_id', params.id)

  // quotes.transcript_id is ON DELETE SET NULL (auto-detaches); conversations.transcript_id has no FK (dangles harmlessly).
  const { error } = await supabaseAdmin.from('transcripts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort: remove the stored audio so it doesn't linger in the bucket.
  const audioUrl = (row?.audio_url as string | null) ?? null
  if (audioUrl) {
    const marker = '/audio-temp/'
    const i = audioUrl.indexOf(marker)
    if (i >= 0) {
      try {
        await supabaseAdmin.storage.from('audio-temp').remove([audioUrl.slice(i + marker.length)])
      } catch {
        /* non-fatal — the row is already gone */
      }
    }
  }
  return NextResponse.json({ ok: true })
}

// PATCH — admin-only rename. Updates the transcript's displayed name (formatted_data.company / quarter).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const company = typeof body?.company === 'string' ? body.company.trim() : undefined
  const quarter = typeof body?.quarter === 'string' ? body.quarter.trim() : undefined
  if (company === undefined && quarter === undefined) {
    return NextResponse.json({ error: 'company or quarter required' }, { status: 400 })
  }

  const { data: row } = await supabaseAdmin
    .from('transcripts')
    .select('formatted_data')
    .eq('id', params.id)
    .maybeSingle()
  if (!row?.formatted_data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  const fd = row.formatted_data as Record<string, unknown>
  if (company !== undefined) fd.company = company
  if (quarter !== undefined) fd.quarter = quarter

  const { error } = await supabaseAdmin.from('transcripts').update({ formatted_data: fd }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
