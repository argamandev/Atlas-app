import { NextRequest, NextResponse } from 'next/server'
import { getChatContext } from '@/lib/chat/context'

// Chat over the transcript DB (brief §5.3). Gemini 3.5 Flash — same engine as the formatting
// pipeline, so it shares GEMINI_API_KEY and works wherever the pipeline does. Transcript
// context is stuffed into the system instruction (no vector DB — per CLAUDE.md).
const CHAT_MODEL = 'gemini-3.5-flash'
const apiKey = process.env.GEMINI_API_KEY

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const message: string = body?.message
  const companyId: string | undefined = body?.companyId || undefined
  const transcriptId: string | undefined = body?.transcriptId || undefined
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  if (!apiKey) {
    return NextResponse.json({
      reply: 'The chat model isn’t configured yet (missing GEMINI_API_KEY).',
      source: null,
    })
  }

  try {
    const ctx = await getChatContext(companyId, transcriptId)

    const system =
      'You are Timlul, a research assistant for Israeli public-company investor calls. ' +
      'Answer the user using the transcript context below when relevant, and cite the speaker by name. ' +
      'If the answer is not in the transcript, say so plainly rather than inventing facts. ' +
      'When the user asks for a comparison or a list, use a clean Markdown table. ' +
      'Reply in the user’s language (Hebrew or English). ' +
      'Respond with only your final answer — no exploratory reasoning or meta-commentary.' +
      (ctx.text ? `\n\n=== TRANSCRIPT CONTEXT ===\n${ctx.text}` : '\n\n(No transcript context is available.)')

    // Keep the last few turns. Gemini requires the first turn to be 'user' and uses the role
    // name 'model' for the assistant.
    let recent = history.slice(-8)
    while (recent.length > 0 && recent[0].role !== 'user') recent = recent.slice(1)
    const contents = [
      ...recent.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ]

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          // thinkingBudget: 0 — CLAUDE.md gotcha: leaving thinking on lets it eat the output
          // budget (truncated answers) and leak reasoning into the reply.
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    )

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: unknown
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json.error ?? json)}`)

    const reply = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()

    return NextResponse.json({ reply: reply || 'לא הצלחתי להפיק תשובה לשאלה הזו.', source: ctx.source })
  } catch (err) {
    console.error('[POST /api/chat]', (err as Error).message)
    return NextResponse.json({ error: 'Chat is temporarily unavailable.' }, { status: 500 })
  }
}
