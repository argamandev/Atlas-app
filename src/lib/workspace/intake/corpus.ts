import type { createServerSupabase } from '@/lib/supabase'
import type { AttachableSource } from '../data'

type UserClient = ReturnType<typeof createServerSupabase>

/**
 * Everything a user may put on a workspace shelf, as one array.
 *
 * SHARED CORPUS, read through the USER'S client: `transcripts`,
 * `company_documents` and `companies` each carry a `for select to authenticated`
 * policy, so this returns the same corpus to every member and no personal rows.
 *
 * Deliberately NOT `/api/transcripts`: that route selects `formatted_data` for
 * 50 rows, which is the entire text of 50 investor calls. A picker needs titles.
 *
 * It lives here rather than inside the sources route because the intake needs the
 * SAME rows. Two copies of this query would drift, and the drift would show up as
 * the picker and the intake disagreeing about what Atlas has — which is exactly
 * the kind of contradiction a user reads as the product being broken.
 *
 * MAYA LANDED 2026-08-06, and its catalog does NOT join here — there is no
 * `maya_filings` table and there was never going to be one. A MAYA query needs a
 * company and a date range, so it cannot be "loaded" the way a corpus can; the
 * intake route asks for it after interpreting the request, and merges the result
 * with what this function returns. What DID change here is `fromMaya` below.
 */
export async function loadCorpus(supabase: UserClient): Promise<AttachableSource[]> {
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
    .select('id, title, quarter, created_at, company_id, source')
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

  return [
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
        source: string | null
      }[]
    ).map((d) => ({
      sourceId: d.id,
      kind: 'document' as const,
      title: d.title?.trim() || d.quarter || d.id,
      company: d.company_id ? (nameById[d.company_id] ?? null) : null,
      when: d.created_at,
      // A DOCUMENT ATLAS ALREADY PULLED FROM MAYA IS STILL A MAYA FILING.
      //
      // Without this the selection step could not answer "get me the 2024
      // annual report from MAYA" once that report had been fetched: the filing
      // is correctly dropped from the remote candidates (offering to fetch
      // something already held is the false-achievement claim), so the only
      // MAYA-marked candidates left were OTHER years — and the model picked one
      // of those rather than the local row that was the actual answer. Observed
      // 3 times out of 3 on 2026-08-06.
      fromMaya: d.source === 'maya',
    })),
  ]
}
