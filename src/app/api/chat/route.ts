import { NextRequest, NextResponse } from 'next/server'
import { getChatContext } from '@/lib/chat/context'

// Chat over the transcript DB (brief §5.3), now **streamed** (Feature 5). Gemini 3.5 Flash —
// same engine + GEMINI_API_KEY as the formatting pipeline. We proxy Gemini's SSE stream and
// re-emit just the text deltas as a plain-text stream so the UI renders tokens as they arrive.
// The citation source (computed up front) rides back on the `x-chat-source` header.
const CHAT_MODEL = 'gemini-3.5-flash'
const apiKey = process.env.GEMINI_API_KEY

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function textResponse(body: BodyInit, init?: ResponseInit) {
  return new Response(body, {
    ...init,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...(init?.headers ?? {}) },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const message: string = body?.message
  const companyId: string | undefined = body?.companyId || undefined
  const transcriptId: string | undefined = body?.transcriptId || undefined
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  if (!apiKey) {
    return textResponse('The chat model isn’t configured yet (missing GEMINI_API_KEY).')
  }

  const ctx = await getChatContext(companyId, transcriptId)

  const system =
    'You are Atlas, a research assistant for Israeli public-company investor calls. ' +
    'Answer the user using the transcript context below when relevant, and cite the speaker by name. ' +
    'If the answer is not in the transcript, say so plainly rather than inventing facts. ' +
    'When the user asks for a comparison or a list, use a clean Markdown table. ' +
    'Reply in the user’s language (Hebrew or English). ' +
    'Respond with only your final answer — no exploratory reasoning or meta-commentary.' +
    (ctx.text ? `\n\n=== TRANSCRIPT CONTEXT ===\n${ctx.text}` : '\n\n(No transcript context is available.)')

  // Gemini requires the first turn to be 'user' and uses 'model' for the assistant.
  let recent = history.slice(-8)
  while (recent.length > 0 && recent[0].role !== 'user') recent = recent.slice(1)
  const contents = [
    ...recent.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  const sourceHeader = ctx.source ? encodeURIComponent(JSON.stringify(ctx.source)) : ''

  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          // thinkingBudget: 0 — CLAUDE.md gotcha: thinking eats the output budget + leaks reasoning.
          generationConfig: { maxOutputTokens: 4096, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    )
  } catch (err) {
    console.error('[POST /api/chat] upstream fetch failed', (err as Error).message)
    return NextResponse.json({ error: 'Chat is temporarily unavailable.' }, { status: 500 })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    console.error('[POST /api/chat] Gemini', upstream.status, detail.slice(0, 300))
    return NextResponse.json({ error: 'Chat is temporarily unavailable.' }, { status: 500 })
  }

  // Re-emit Gemini's SSE text deltas as a plain UTF-8 text stream.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
      let emitted = false
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
              }
              const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
              if (text) {
                emitted = true
                controller.enqueue(encoder.encode(text))
              }
            } catch {
              /* skip malformed SSE frame */
            }
          }
        }
      } catch (err) {
        console.error('[POST /api/chat] stream read error', (err as Error).message)
      }
      if (!emitted) controller.enqueue(new TextEncoder().encode('לא הצלחתי להפיק תשובה לשאלה הזו.'))
      controller.close()
    },
  })

  return textResponse(stream as unknown as BodyInit, { headers: { 'x-chat-source': sourceHeader } })
}
