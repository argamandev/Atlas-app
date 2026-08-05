import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { askModel } from '@/lib/workspace/askModel'
import { loadItemContent } from '@/lib/workspace/content'
import { buildContext, contentToText, type SourceText } from '@/lib/workspace/chat/context'
import { buildComposePrompt, parseCompose } from '@/lib/workspace/chat/compose'
import { parseAttachments } from '@/lib/chat/attachments'

export const dynamic = 'force-dynamic'

const COMPOSE_TIMEOUT_MS = 30_000

/**
 * Atlas drafts a passage for the analyst's own document.
 *
 * It returns ONLY the new passage and where it goes — see lib/workspace/chat/
 * compose for why it is never handed the whole document to rewrite.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => null)) as {
    instruction?: unknown
    document?: unknown
    headings?: unknown
    passage?: unknown
    clip?: unknown
  } | null

  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 4000) : ''
  if (!instruction) {
    return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
  }
  const document = typeof body?.document === 'string' ? body.document.slice(0, 40_000) : ''
  const headings = Array.isArray(body?.headings)
    ? body.headings.filter((h): h is string => typeof h === 'string').slice(0, 60)
    : []
  const passage = parsePassage(body?.passage)
  // A CLIPPING, i.e. the instruction is about a picture. Validated with the same
  // parser the chat's snips go through — one PNG, under the same size cap — so
  // an oversized or foreign data URL is dropped HERE rather than being sent to a
  // provider that would reject the whole call.
  const clipImage = parseAttachments(
    Array.isArray((body?.clip as { image?: unknown })?.image)
      ? (body?.clip as { image: unknown[] }).image
      : [(body?.clip as { image?: unknown })?.image]
  )[0]
  const clipMeta = parseClipMeta(body?.clip)
  // The picture without its provenance is an anonymous table; the provenance
  // without the picture is a prompt about an image the model cannot see.
  const clip = clipImage && clipMeta ? { image: clipImage, meta: clipMeta } : null

  try {
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)
    if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    const { data: items, error: iErr } = await supabase
      .from('workspace_items')
      .select('id, name, kind')
      .eq('workspace_id', params.id)
      .order('position')
    if (iErr) throw new Error(iErr.message)

    // The same grounding the chat gets — a document written from the model's
    // memory of a company rather than from the analyst's own files is the exact
    // thing this chapter has spent its time deleting.
    const sources: SourceText[] = []
    await Promise.all(
      (items ?? []).map(async (i) => {
        try {
          const content = await loadItemContent(supabase, params.id, i.id as string)
          const text = contentToText(content)
          if (text.trim()) {
            sources.push({
              itemId: i.id as string,
              title: i.name as string,
              kind: i.kind as string,
              text,
            })
          }
        } catch {
          /* an unreadable file contributes nothing; the pane already says so */
        }
      })
    )
    const order = new Map((items ?? []).map((i, n) => [i.id as string, n]))
    sources.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0))
    const context = buildContext(sources)

    const raw = await askModel(
      buildComposePrompt({
        instruction,
        document,
        context: context.text,
        truncated: context.truncated,
        passage,
        clip: clip?.meta ?? null,
        headings,
      }),
      {
        maxOutputTokens: 2400,
        timeoutMs: COMPOSE_TIMEOUT_MS,
        // The image goes to BOTH providers, for the reason askModel documents:
        // a hedged answer written without the picture would be worse than no
        // answer and indistinguishable from a good one.
        ...(clip
          ? {
              attachments: [clip.image],
              captions: [
                clip.meta.title ? `${clip.meta.title} · ${clip.meta.pageLabel}` : clip.meta.pageLabel,
              ],
            }
          : {}),
      }
    )

    const result = parseCompose(raw, headings)
    if (!result) {
      // NOT an empty insertion. The client says it could not write rather than
      // silently adding nothing and looking like it worked.
      return NextResponse.json({ result: null }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json(
      { result: { ...result, partial: [...context.truncated, ...context.omitted] } },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Where the clipping was cut from — for the prompt and for the caption. */
function parseClipMeta(raw: unknown): { title: string; pageLabel: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { title?: unknown; pageLabel?: unknown }
  const pageLabel = typeof o.pageLabel === 'string' ? o.pageLabel.trim().slice(0, 80) : ''
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
  if (!pageLabel && !title) return null
  return { title, pageLabel }
}

function parsePassage(raw: unknown): { title: string; text: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { title?: unknown; text?: unknown }
  const text = typeof o.text === 'string' ? o.text.trim().slice(0, 6000) : ''
  if (!text) return null
  return { title: typeof o.title === 'string' ? o.title.trim().slice(0, 300) : '', text }
}
