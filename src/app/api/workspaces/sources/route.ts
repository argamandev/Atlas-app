import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadCorpus } from '@/lib/workspace/intake/corpus'

export const dynamic = 'force-dynamic'

/**
 * What a user may put on a workspace shelf.
 *
 * The query itself lives in `lib/workspace/intake/corpus.ts` because the intake
 * route needs the identical rows — see the reasoning in that file's header.
 */
export async function GET() {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    const sources = await loadCorpus(supabase)
    return NextResponse.json({ sources }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
