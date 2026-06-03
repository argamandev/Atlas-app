import { cookies } from 'next/headers'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'

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
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return { userId: null, userName: 'משתמש', isAdmin: false }
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, role')
    .eq('id', session.user.id)
    .single()

  const userName =
    profile?.first_name || session.user.email?.split('@')[0] || 'משתמש'

  return {
    userId: session.user.id,
    userName,
    isAdmin: profile?.role === 'admin',
  }
}
