import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase'
import { israelDayKey } from '@/lib/i18n/format'
import { runChatLoop, type ChatEvent, type ChatTurn } from '@/lib/chat2/loop'
import type { ChatScope } from '@/lib/chat2/toolDefs'

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

/** Every client-supplied id in this route names a `uuid` column, or names nothing. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // Every id the CLIENT supplies is uuid-shaped or it is not an id (all three
  // columns are `uuid`). Round 1's cold review found `companyId` reaching the
  // SYSTEM prompt raw via `scopeSummary`, in the one route whose ticket is
  // injection discipline — a client could put arbitrary instruction text there.
  //
  // The guard goes HERE, where scope is built, not down at the interpolation
  // (M3.1): the string is refused at the single point every downstream use flows
  // through — the prompt, the tool handlers and the queries alike — so closing
  // the prompt path cannot leave the others open.
  const asUuid = (v: unknown): string | undefined =>
    typeof v === 'string' && UUID_RE.test(v) ? v : undefined

  const scope: ChatScope = {
    userId,
    companyId: asUuid(body?.companyId),
    transcriptId: asUuid(body?.transcriptId),
    workspaceId: asUuid(body?.workspaceId),
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
          scopeSummary: scope.companyId ? `company: ${scope.companyId} (resolved)` : undefined,
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
