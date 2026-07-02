import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'

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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.id ?? null
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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return { userId: null, userName: 'משתמש', isAdmin: false }
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, role')
    .eq('id', session.user.id)
    .single()

  const userName = profile?.first_name || session.user.email?.split('@')[0] || 'משתמש'

  return {
    userId: session.user.id,
    userName,
    isAdmin: profile?.role === 'admin',
  }
}
