import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'

/**
 * The single 401 an API route returns when there is no signed-in user.
 *
 * It lives here, next to `getRequestUserId`, so the guard and the refusal are
 * one import — `if (!userId) return unauthorized()` is the whole pattern, and
 * `src/lib/apiAuthBoundary.test.ts` fails the build for any route method that
 * omits it.
 *
 * WHY IT EXISTS AT ALL: 16 call sites across 8 route files used to end
 * `?? DEMO_USER_ID`, silently pooling every anonymous caller into one shared
 * identity (`00000000-…`) that owns rows in the real database. That is not a
 * missing feature, it is a door: an anonymous request read and wrote that
 * identity's quotes, folders, followed calls and conversations. The page gate
 * (2026-08-01) closed the /app/* PAGES; these routes are direct API calls and
 * the gate never covered them.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

// Resolves the user id from a request, accepting EITHER the browser session
// cookie OR an `Authorization: Bearer <access_token>` header. The bearer path
// lets trusted automation (e.g. the transcript-reviewer batch script) drive the
// same API the browser uses. Returns null if neither yields a valid user.
export async function getRequestUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && data.user) return data.user.id
    }
  }

  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)
  return user?.id ?? null
}

// Admin gate for CURATION routes — writes that change what every user sees, e.g. fixing a
// speaker's name on a shared transcript (docs/DATA-MODEL.md, "Writes to the shared corpus are
// CURATION", founder decision 2026-08-13). Resolves the caller like `getRequestUserId` (cookie
// or bearer), then requires `profiles.role === 'admin'`. Returns the refusal to send, or null
// when the caller may proceed:
//   const denied = await requireAdmin(req);  if (denied) return denied
// Note the boundary test recognises exactly this delegation shape, and `curationAuthz.test.ts`
// asserts the curation routes use it — a curation route gated any other way fails the battery.
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export interface CurrentUser {
  userId: string | null
  userName: string
  isAdmin: boolean
}

// Resolves the logged-in user's id, display name and admin flag.
// Shared by the dashboard, companies and transcript pages.
export async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const user = await resolveUser(supabase)

  if (!user) {
    return { userId: null, userName: 'משתמש', isAdmin: false }
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, role')
    .eq('id', user.id)
    .single()

  const userName = profile?.first_name || user.email?.split('@')[0] || 'משתמש'

  return {
    userId: user.id,
    userName,
    isAdmin: profile?.role === 'admin',
  }
}
