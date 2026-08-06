import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { addItem } from '@/lib/db/workspaces'
import { ensureCompanyForIssuer } from '@/lib/db/companies'
import { ingestFiling } from '@/lib/maya/ingestFiling'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources } from '@/lib/maya/filings'
import { describeFailure } from '@/lib/maya/types'
import { parseRemoteSource } from '@/lib/workspace/validate'

export const dynamic = 'force-dynamic'

/**
 * Fetch a MAYA filing into Atlas, then put it on this shelf.
 *
 * WHY THIS IS ITS OWN ENDPOINT rather than part of the intake response: the
 * work is a download plus a page-by-page text extraction — seconds, not
 * milliseconds, for a 41-page annual report. Doing it inside the intake turn
 * would make the conversational reply wait on the slowest file. Here the client
 * calls it once per confirmed filing, exactly as it already calls the ordinary
 * items route, so progress and failure are both per-file and the panel's
 * existing `failures[]` renders them.
 *
 * THE BODY IS UNTRUSTED even though the intake produced it. It names a URL to
 * fetch and a company to write, so it is re-validated here — `parseRemoteSource`
 * pins the host to mayafiles.tase.co.il, which stops this becoming a
 * server-side request forgery that fetches whatever a caller names.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const parsed = parseRemoteSource(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const source = parsed.value

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'document storage is not configured' }, { status: 500 })
  }

  try {
    // The workspace must be the caller's own. RLS answers it: one that is not
    // theirs is simply not there, so 404 covers both "never existed" and
    // "someone else's" — the same shape the other workspace routes use.
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)
    if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    // ALREADY IN ATLAS? Then this is an attach, not a fetch. Re-downloading a
    // 2MB PDF because a second analyst asked for the same filing is waste, and
    // the unique index on maya_report_id makes the check exact rather than a
    // guess from a title.
    const existing = await supabase
      .from('company_documents')
      .select('id, title')
      .eq('maya_report_id', source.mayaReportId)
      .limit(1)
      .maybeSingle()
    if (existing.error) throw new Error(existing.error.message)

    let documentId = existing.data?.id as string | undefined
    let title = existing.data?.title as string | undefined

    if (!documentId) {
      // ─────────────────────────────────────────────────────────────────────
      // ASK MAYA WHAT THIS FILING ACTUALLY IS. The request said only which
      // filing; the title, the issuer's name and the file's location all come
      // from the feed, never from the caller. That is what keeps a browser
      // from naming a company or a document for every member of the platform.
      // ─────────────────────────────────────────────────────────────────────
      const year = source.publishedISO
        ? new Date(source.publishedISO).getUTCFullYear()
        : new Date().getUTCFullYear()

      const listed = await listDisclosures({ issuerId: source.issuerId, fromYear: year, toYear: year })
      if (!listed.ok) {
        return NextResponse.json(
          { error: `could not reach MAYA — ${describeFailure(listed.failure)}` },
          { status: 502 }
        )
      }

      const match = toRemoteSources(listed.data).find((s) => s.mayaReportId === source.mayaReportId)
      if (!match) {
        // Either the filing does not exist, or it is not one Atlas offers
        // (no PDF, or an event type outside the whitelist). Both are a plain
        // "not available", not a server error.
        return NextResponse.json({ error: 'that filing is not available from MAYA' }, { status: 404 })
      }

      const companyId = await ensureCompanyForIssuer(match.issuerId, match.issuerName)
      const ingested = await ingestFiling({ source: match, companyId, supabaseUrl, serviceRoleKey })
      documentId = ingested.documentId
      title = match.title
    }

    // `document`, because that is what a shelf item's kind means here — where
    // the content lives, not what sort of document it is. A deck and a report
    // are both `company_documents` rows and both open in the PDF pane; the
    // report/slides distinction rides on the row itself.
    const { item, created } = await addItem(supabase, user.id, params.id, {
      document_id: documentId,
      name: title ?? 'MAYA filing',
      kind: 'document',
    })
    return NextResponse.json({ item, fetched: !existing.data }, { status: created ? 201 : 200 })
  } catch (e) {
    // The message is the one the panel shows beside this file's title, so it
    // has to say what actually went wrong — "not a PDF (212 bytes)" rather than
    // a generic failure the analyst cannot act on.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
