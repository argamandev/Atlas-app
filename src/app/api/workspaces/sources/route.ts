import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

import type { AttachableSource } from '@/lib/workspace/data'

/**
 * What a user may put on a workspace shelf.
 *
 * SHARED CORPUS, read through the USER'S client: `transcripts`,
 * `company_documents` and `companies` each carry a `for select to authenticated`
 * policy, so this returns the same corpus to every member and no personal rows.
 *
 * Deliberately NOT `/api/transcripts`: that route selects `formatted_data` for
 * 50 rows, which is the entire text of 50 investor calls. A picker needs titles.
 */
export async function GET() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    // Only transcripts that actually HAVE content. Attaching an unprocessed row
    // would put a source on the shelf that opens to nothing, and `is not null`
    // filters server-side without transferring the column.
    const { data: transcripts, error: tErr } = await supabase
      .from('transcripts')
      .select('id, youtube_title, created_at, company_id')
      .not('formatted_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (tErr) throw new Error(tErr.message)

    const { data: documents, error: dErr } = await supabase
      .from('company_documents')
      .select('id, title, quarter, created_at, company_id')
      .order('created_at', { ascending: false })
      .limit(200)
    if (dErr) throw new Error(dErr.message)

    type Row = { company_id: string | null }
    const companyIds = [...(transcripts ?? []), ...(documents ?? [])]
      .map((r) => (r as Row).company_id)
      .filter((v, i, a): v is string => !!v && a.indexOf(v) === i)

    const nameById: Record<string, string> = {}
    if (companyIds.length > 0) {
      const { data: companies, error: cErr } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds)
      if (cErr) throw new Error(cErr.message)
      for (const c of (companies ?? []) as { id: string; name: string }[]) nameById[c.id] = c.name
    }

    const sources: AttachableSource[] = [
      ...(
        (transcripts ?? []) as {
          id: string
          youtube_title: string | null
          created_at: string | null
          company_id: string | null
        }[]
      ).map((t) => ({
        sourceId: t.id,
        kind: 'transcript' as const,
        // Falls back to the id rather than to an invented title.
        title: t.youtube_title?.trim() || t.id,
        company: t.company_id ? (nameById[t.company_id] ?? null) : null,
        when: t.created_at,
      })),
      ...(
        (documents ?? []) as {
          id: string
          title: string | null
          quarter: string | null
          created_at: string | null
          company_id: string | null
        }[]
      ).map((d) => ({
        sourceId: d.id,
        kind: 'document' as const,
        title: d.title?.trim() || d.quarter || d.id,
        company: d.company_id ? (nameById[d.company_id] ?? null) : null,
        when: d.created_at,
      })),
    ]

    return NextResponse.json({ sources }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
