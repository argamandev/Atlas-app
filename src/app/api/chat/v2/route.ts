import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase'
import { israelDayKey } from '@/lib/i18n/format'
import { runChatLoop, type ChatEvent, type ChatTurn } from '@/lib/chat2/loop'
import type { ChatScope } from '@/lib/chat2/toolDefs'
import { parseTurnScope, scopeIdsFor } from '@/lib/chat2/requestScope'
import { CALL_SCOPE_SUMMARY } from '@/lib/chat2/callInjection'
import { LIVE_SCOPE_SUMMARY } from '@/lib/chat2/liveInjection'

// ─────────────────────────────────────────────────────────────────────────────
// THE UNIFIED CHAT BACKEND (spec §3, ticket 06/B1a). Replaces `/api/chat` for
// callers migrated onto it — the old route keeps serving until B2 retires its
// wire format (migration order is law, spec §3).
//
// The stream is NDJSON of `ChatEvent` (loop.ts) — one JSON object per line,
// never raw model text. That is what makes "missing key ≠ a 200 answer" and
// "a mid-stream failure ends visibly truncated, never persisted as complete"
// true by construction: there is no code path that turns an error into
// `delta` text, in this route or the loop it wraps.
//
// NO route.test.ts, deliberately, matching every other file under
// src/app/api: `@/lib/auth` (and this route's own `@/lib/supabase` import)
// construct a real Supabase client at module load, which throws without live
// env vars — no test file in this repo imports either module directly. The
// 401 path is proven structurally by `apiAuthBoundary.test.ts` (every
// handler resolves a user AND refuses without one); the wire format —
// injection fencing, error/degradation framing, the round-trip cap, the
// intake-regression correction reaching `resolve_company` — is exercised at
// the unit the route only wraps: `loop.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

function ndjsonLine(e: ChatEvent): string {
  return JSON.stringify(e) + '\n'
}

export async function POST(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  const message: string = typeof body?.message === 'string' ? body.message : ''
  if (!message.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter((t: unknown): t is ChatTurn => {
          const turn = t as ChatTurn
          return (
            !!turn &&
            (turn.role === 'user' || turn.role === 'assistant') &&
            typeof turn.content === 'string' &&
            turn.content.trim().length > 0
          )
        })
        .slice(-8)
    : []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Missing-key ≠ a 200 answer (spec §3). A 503 the client can render as
    // "chat unavailable" beats a 200 body no caller can distinguish from a
    // real answer.
    return NextResponse.json({ error: 'chat is not configured (missing ANTHROPIC_API_KEY)' }, { status: 503 })
  }

  // WHAT THIS TURN IS GROUNDED IN — one union, one recipe, uuid-gated at ONE
  // point in `requestScope.ts` (which is where the reasoning and its tests live)
  // rather than inline here, so the guard between an untrusted body and the
  // system prompt is testable.
  //
  // A REFUSED GROUNDING IS A 400, not a quiet downgrade to market-wide search.
  // The surface that sent `{kind:'call'}` is showing a chip naming that call; an
  // answer from the general corpus underneath it is the ticket-07 defect, and a
  // 400 is the only reading of a malformed grounding that the screen cannot
  // contradict.
  //
  // AND THE PROJECT ALONGSIDE IT (ticket 08c) — a second question, not a fifth
  // recipe. `parseTurnScope` reads both and refuses a malformed either.
  const turn = parseTurnScope(body)
  if (!turn) {
    return NextResponse.json({ error: 'this grounding cannot be honoured' }, { status: 400 })
  }
  const { grounding } = turn

  const scope: ChatScope = {
    userId,
    ...scopeIdsFor(turn),
    // REQUIRED for a project turn, not merely convenient: `loadProjectForInjection`
    // goes through this client so RLS — not a filter in application code — decides
    // whether the project is the caller's (db.md ownership law).
    userDb: createServerSupabase(cookies()),
  }

  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of runChatLoop({
          client,
          scope,
          history,
          message,
          todayIsrael: israelDayKey(new Date()),
          // THE ONE RECIPE WHOSE CONTENT TRAVELS WITH THE REQUEST (08c-2). It
          // does not go through `scopeIdsFor` because it is not an id — a call
          // still running has no stored row to name — so it is handed to the loop
          // as what it is. Gated for size at `parseGrounding`, fenced at
          // `buildLiveBlock`, and never interpolated into the system prompt.
          live:
            grounding.kind === 'live' ? { captions: grounding.captions, label: grounding.label } : undefined,
          // Built from the GROUNDING union, so there is one answer per recipe
          // rather than a chain of `if (someField)` that two recipes could both
          // satisfy. Every value interpolated here is a uuid — `parseGrounding`
          // refused anything else, which is what keeps an untrusted body out of
          // the system prompt (round 1 of ticket 06).
          scopeSummary:
            grounding.kind === 'company'
              ? `company: ${grounding.companyId} (resolved)`
              : grounding.kind === 'call'
                ? CALL_SCOPE_SUMMARY
                : grounding.kind === 'live'
                  ? LIVE_SCOPE_SUMMARY
                  : undefined,
        })) {
          controller.enqueue(encoder.encode(ndjsonLine(event)))
        }
      } catch (err) {
        // The loop itself never throws (loop.ts), but a stream write failing this
        // late must still end in an `error` frame, not silence.
        controller.enqueue(encoder.encode(ndjsonLine({ type: 'error', message: (err as Error).message })))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
