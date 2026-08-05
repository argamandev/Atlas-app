import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { askModel } from '@/lib/workspace/askModel'
import { loadItemContent } from '@/lib/workspace/content'
import { contentToText, type SourceText } from '@/lib/workspace/chat/context'
import { estimateTokens, fitHistory, planContext, splitBudget } from '@/lib/workspace/chat/plan'
import { buildChatPrompt, parseChatAnswer, type ChatTurn } from '@/lib/workspace/chat/prompt'
import { parseAttachments, snipCaption } from '@/lib/chat/attachments'

export const dynamic = 'force-dynamic'

/** A grounded read over several documents is not an interactive one-liner. */
const CHAT_TIMEOUT_MS = 25_000
const MAX_TURNS = 24

/**
 * THE WHOLE PROMPT'S CEILING, in tokens, measured against the real limit.
 *
 * The account is rated 30,000 tokens per minute for gpt-4.1, and that ceiling
 * covers the request AND the answer. 18,000 for everything sent leaves room for
 * a 1,400-token reply and for the analyst to ask a second question inside the
 * same minute without the first one having eaten the allowance.
 */
const PROMPT_BUDGET_TOKENS = 18_000
/** The instructions, the shelf listing and the JSON contract around the parts we measure. */
const PROMPT_OVERHEAD_TOKENS = 900
/** A clipped page, priced the way vision models charge for a detailed image. */
const IMAGE_TOKENS = 800

/**
 * Talk to Atlas about this workspace.
 *
 * GROUNDED, and grounded is the whole point: the shelf's actual text goes into
 * the prompt and the model is told to answer from that and nothing else. The
 * alternative — a chat that answers about Tigbur from whatever it remembers
 * about Tigbur — is the same failure class as the fabricated report this chapter
 * has just finished deleting, only harder to spot because it is fluent.
 *
 * It cannot attach a file. When the analyst asks for one it returns
 * `wantsDocuments`, and the client hands that to the intake conversation, which
 * is the ONE path that names files and waits for a yes.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => null)) as {
    messages?: unknown
    selection?: unknown
    attachments?: unknown
  } | null

  const messages = parseTurns(body?.messages)
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }
  const selection = parseSelection(body?.selection)
  // The SAME validator /api/chat uses — shape, PNG prefix, size cap, count cap.
  // A clip past the cap is dropped here, which is why the client refuses to
  // send one (`attachmentOversized`): a chip on screen for an image the server
  // silently discarded is the visible-degradation law's exact bad case.
  const attachments = parseAttachments(body?.attachments)

  try {
    // RLS answers ownership: a workspace that is not this user's is simply not
    // there, so 404 covers both "never existed" and "someone else's".
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('id', params.id)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)
    if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    const { data: items, error: iErr } = await supabase
      .from('workspace_items')
      .select('id, name, kind, document_id')
      .eq('workspace_id', params.id)
      .order('position')
    if (iErr) throw new Error(iErr.message)

    // A clip's caption names the page AND the file it came from, so an answer
    // can cite it the way it cites text. The title comes from the shelf item
    // the clip's document belongs to; a clip of something not on this shelf
    // still gets the generic caption rather than a wrong one.
    const docTitles = new Map(
      (items ?? []).filter((i) => i.document_id).map((i) => [i.document_id as string, i.name as string])
    )
    const captions = attachments.map((a) => {
      const t = docTitles.get(a.documentId)
      return snipCaption(t ? { title: t } : null, a.page)
    })

    const shelf = (items ?? []).map((i) => ({
      title: i.name as string,
      kind: i.kind as string,
    }))

    // Every item's text, read in parallel. An item that cannot be read does not
    // fail the question — it contributes nothing and is reported as unreadable,
    // which is the same rule the pane follows when it renders one.
    const sources: SourceText[] = []
    const unreadable: string[] = []
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
          } else {
            unreadable.push(i.name as string)
          }
        } catch {
          unreadable.push(i.name as string)
        }
      })
    )
    // The parallel reads finish in whatever order they finish; the prompt should
    // read in shelf order so "the first call" means what it says on screen.
    const order = new Map((items ?? []).map((i, n) => [i.id as string, n]))
    sources.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0))

    // ── READ WHAT THE QUESTION NEEDS ─────────────────────────────────────────
    //
    // Founder, 2026-08-05: *"we need to build a smart token efficient workflow
    // inside the workspace."* What this replaces sent the first N characters of
    // EVERY file on EVERY turn, so a question about the end of a call was
    // answered out of its beginning, at full price, every time.
    //
    // ONE BUDGET, split. The history and the sources used to be capped
    // independently — 24 turns of up to 4,000 characters each, plus a 40,000
    // character context — so both could be inside their own limit while the
    // prompt was twice the account's per-minute allowance.
    const question = messages[messages.length - 1]?.content ?? ''
    const overhead =
      estimateTokens(question) +
      estimateTokens(selection?.text ?? '') +
      PROMPT_OVERHEAD_TOKENS +
      attachments.length * IMAGE_TOKENS
    const budget = splitBudget({ totalTokens: PROMPT_BUDGET_TOKENS, overheadTokens: overhead })
    const history = fitHistory(messages, budget.history)
    const context = planContext({ question, sources, budgetTokens: budget.sources })

    const raw = await askModel(
      buildChatPrompt({
        workspaceName: (ws.name as string) ?? '',
        shelf,
        context: context.text,
        truncated: context.truncated,
        conversation: history.kept,
        selection,
        snipCount: attachments.length,
      }),
      { maxOutputTokens: 1400, timeoutMs: CHAT_TIMEOUT_MS, attachments, captions }
    )

    const answer = parseChatAnswer(raw)
    if (!answer) {
      // NOT an empty bubble and NOT an invented answer — the client renders its
      // own "could not answer" line, in the user's language.
      return NextResponse.json(
        { result: { reply: null, wantsDocuments: null, partial: [], unreadable } },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json(
      {
        result: {
          reply: answer.reply,
          wantsDocuments: answer.wantsDocuments,
          // What the answer could NOT see. The UI states this under the reply;
          // an answer drawn from part of a transcript must not look complete.
          partial: [...context.truncated, ...context.omitted],
          unreadable,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

function parseTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: ChatTurn[] = []
  for (const t of raw) {
    const o = t as { role?: unknown; content?: unknown }
    const role = o?.role === 'assistant' ? 'assistant' : o?.role === 'user' ? 'user' : null
    const content = typeof o?.content === 'string' ? o.content.trim() : ''
    if (!role || !content) continue
    turns.push({ role, content: content.slice(0, 4000) })
  }
  return turns.slice(-MAX_TURNS)
}

/** The marked passage, from an untrusted body. Bounded: a selection is a
 *  passage a person highlighted, not a whole document pasted back at us. */
function parseSelection(raw: unknown): { title: string; text: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { title?: unknown; text?: unknown }
  const text = typeof o.text === 'string' ? o.text.trim().slice(0, 4000) : ''
  if (!text) return null
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
  return { title, text }
}
