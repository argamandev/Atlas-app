import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getChatContext } from '@/lib/chat/context'

// Chat over the transcript DB (brief §5.3). Anthropic SDK, claude-sonnet-4-6, transcript
// context-stuffed into the system prompt. The project stores its key as CLAUDE_API_KEY,
// so pass it explicitly (the SDK otherwise looks for ANTHROPIC_API_KEY).
const CHAT_MODEL = 'claude-sonnet-4-6'
const apiKey = process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const message: string = body?.message
  const companyId: string | undefined = body?.companyId || undefined
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  if (!apiKey) {
    return NextResponse.json({
      reply: 'The chat model isn’t configured yet (missing CLAUDE_API_KEY).',
      source: null,
    })
  }

  try {
    const ctx = await getChatContext(companyId)
    const client = new Anthropic({ apiKey })

    const system =
      'You are Timlul, a research assistant for Israeli public-company investor calls. ' +
      'Answer the user using the transcript context below when relevant, and cite the speaker by name. ' +
      'If the answer is not in the transcript, say so plainly rather than inventing facts. ' +
      'When the user asks for a comparison or a list, use a clean Markdown table. ' +
      'Reply in the user’s language (Hebrew or English). ' +
      'Respond with only your final answer — no exploratory reasoning or meta-commentary.' +
      (ctx.text ? `\n\n=== TRANSCRIPT CONTEXT ===\n${ctx.text}` : '\n\n(No transcript context is available.)')

    // Keep the last few turns, but the Anthropic API requires the first message to be
    // a user turn — drop any leading assistant message after slicing.
    let recent = history.slice(-8)
    while (recent.length > 0 && recent[0].role !== 'user') recent = recent.slice(1)
    const messages = [
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ]

    const resp = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 4096,
      system,
      messages,
    })

    if (resp.stop_reason === 'refusal') {
      return NextResponse.json({ reply: 'I’m not able to help with that request.', source: null })
    }

    const reply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return NextResponse.json({ reply, source: ctx.source })
  } catch (err) {
    console.error('[POST /api/chat]', (err as Error).message)
    return NextResponse.json({ error: 'Chat is temporarily unavailable.' }, { status: 500 })
  }
}
