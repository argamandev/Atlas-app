import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getChatContext, getDocumentContext } from '@/lib/chat/context'
import { getRequestUserId } from '@/lib/auth'
import {
  parseAttachments,
  snipCaption,
  geminiSnipParts,
  openAiSnipContent,
  type ChatAttachment,
} from '@/lib/chat/attachments'
import { getDocumentMeta } from '@/lib/documents'

// Chat over the transcript DB (brief §5.3), now **streamed** (Feature 5). Gemini 3.5 Flash —
// same engine + GEMINI_API_KEY as the formatting pipeline. We proxy Gemini's SSE stream and
// re-emit just the text deltas as a plain-text stream so the UI renders tokens as they arrive.
// The citation source (computed up front) rides back on the `x-chat-source` header.
const CHAT_MODEL = 'gemini-3.5-flash'
// GPT-4.1 backs up the chat the same way it backs up the finish formatter (transcription.ts).
const CHAT_FALLBACK_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1'
const apiKey = process.env.GEMINI_API_KEY

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function textResponse(body: BodyInit, init?: ResponseInit) {
  return new Response(body, {
    ...init,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...(init?.headers ?? {}),
    },
  })
}

// GPT-4.1 streaming fallback — fires when Gemini is unavailable (503 / network blip) so the live
// chat keeps working mid-call. Same system + history; re-emits OpenAI deltas as the plain-text
// stream the client already expects. Returns null when OPENAI_API_KEY is absent or init fails.
async function openAiFallback(
  system: string,
  recent: ChatMessage[],
  message: string,
  sourceHeader: string,
  snipContent: Array<Record<string, unknown>> = []
): Promise<Response | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const openai = new OpenAI({ apiKey: key })
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      ...recent.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: 'user',
        content:
          snipContent.length > 0
            ? ([
                ...snipContent,
                { type: 'text', text: message },
              ] as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[])
            : message,
      },
    ]
    const completion = await openai.chat.completions.create({
      model: CHAT_FALLBACK_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    })
    console.warn('[POST /api/chat] Gemini unavailable — using OpenAI', CHAT_FALLBACK_MODEL, 'fallback')
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        let emitted = false
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              emitted = true
              controller.enqueue(encoder.encode(delta))
            }
          }
        } catch (err) {
          console.error('[POST /api/chat] OpenAI fallback stream error', (err as Error).message)
        }
        if (!emitted) controller.enqueue(encoder.encode('לא הצלחתי להפיק תשובה לשאלה הזו.'))
        controller.close()
      },
    })
    return textResponse(stream as unknown as BodyInit, {
      headers: { 'x-chat-source': sourceHeader, 'x-chat-fallback': 'openai' },
    })
  } catch (err) {
    console.error('[POST /api/chat] OpenAI fallback init failed', (err as Error).message)
    return null
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const message: string = body?.message
  const companyId: string | undefined = body?.companyId || undefined
  const transcriptId: string | undefined = body?.transcriptId || undefined
  // The LIVE view sends the on-screen captions directly (there's no completed transcript yet) so the
  // chat is grounded on the call in front of the user — not a DB lookup that could hit another company.
  const liveContext: string | undefined = body?.liveContext || undefined
  // Multiview M1: a marked PDF passage arrives with its document + page numbers; the stored
  // page text becomes a labeled REPORT CONTEXT block beside the transcript.
  const documentRef: { documentId: string; pages: number[] } | undefined =
    body?.documentRef &&
    typeof body.documentRef.documentId === 'string' &&
    Array.isArray(body.documentRef.pages)
      ? { documentId: body.documentRef.documentId, pages: body.documentRef.pages }
      : undefined
  // Pinge snips: validated here, auth-gated below exactly like documentRef.
  let attachments: ChatAttachment[] = parseAttachments(body?.attachments)
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  if (!apiKey) {
    return textResponse('The chat model isn’t configured yet (missing GEMINI_API_KEY).')
  }

  const ctx = liveContext
    ? { text: liveContext.slice(0, 40_000), source: null }
    : await getChatContext(companyId, transcriptId)

  // Document grounding is auth-gated even though chat itself is not — documentRef reads company
  // documents via supabaseAdmin (bypasses RLS), so only a signed-in user may trigger that lookup.
  const userId = documentRef || attachments.length > 0 ? await getRequestUserId(req) : null
  // No signed-in user → no document access of any kind (same policy + launch-notes flag as docRef).
  if (!userId) attachments = []

  // Snipped pages ride the documentRef page-text grounding: image = authority on the
  // numbers, page prose = surrounding context (spec 2026-07-17).
  let groundingRef = documentRef
  if (attachments.length > 0) {
    const snipDocId = attachments[0].documentId
    const pages = Array.from(
      new Set([
        ...(groundingRef && groundingRef.documentId === snipDocId ? groundingRef.pages : []),
        ...attachments.map((a) => a.page),
      ])
    )
    if (!groundingRef || groundingRef.documentId === snipDocId) {
      groundingRef = { documentId: snipDocId, pages }
    }
  }
  const snipMeta =
    attachments.length > 0 ? await getDocumentMeta(attachments[0].documentId).catch(() => null) : null
  const captions = attachments.map((a) => snipCaption(snipMeta ? { title: snipMeta.title } : null, a.page))
  const docBlock = groundingRef && userId ? await getDocumentContext(groundingRef).catch(() => '') : ''

  const system =
    'You are Atlas, a research assistant for Israeli public-company investor calls. ' +
    'Answer the user using the transcript context below when relevant, and cite the speaker by name. ' +
    'If the answer is not in the transcript, say so plainly rather than inventing facts. ' +
    'When the user asks for a comparison or a list, use a clean Markdown table. ' +
    'Reply in the user’s language (Hebrew or English). ' +
    'Respond with only your final answer — no exploratory reasoning or meta-commentary.' +
    (attachments.length > 0
      ? '\nSnipped images from the quarterly report are attached. Read the numbers from the image itself — it is the authoritative source — and mention the page number when you cite it.'
      : '') +
    (docBlock
      ? '\nWhen a REPORT CONTEXT block is present, connect the report to the call: relate the marked passage to what management said on the call when relevant.\n\n' +
        docBlock +
        '\n'
      : '') +
    (ctx.text ? `\n\n=== TRANSCRIPT CONTEXT ===\n${ctx.text}` : '\n\n(No transcript context is available.)')

  // Gemini requires the first turn to be 'user' and uses 'model' for the assistant.
  let recent = history.slice(-8)
  while (recent.length > 0 && recent[0].role !== 'user') recent = recent.slice(1)
  const contents = [
    ...recent.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [...geminiSnipParts(attachments, captions), { text: message }] },
  ]

  const sourceHeader = ctx.source ? encodeURIComponent(JSON.stringify(ctx.source)) : ''

  let upstream: Response | null = null
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
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )
  } catch (err) {
    console.error('[POST /api/chat] upstream fetch failed', (err as Error).message)
  }

  if (!upstream || !upstream.ok || !upstream.body) {
    if (upstream && !upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      console.error('[POST /api/chat] Gemini', upstream.status, detail.slice(0, 300))
    }
    // Gemini down or blipped → GPT-4.1 so the chat doesn't die mid-call.
    const fallback = await openAiFallback(
      system,
      recent,
      message,
      sourceHeader,
      openAiSnipContent(attachments, captions)
    )
    if (fallback) return fallback
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
