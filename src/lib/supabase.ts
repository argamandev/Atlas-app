import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server client — reads session from cookies in server components / API routes
export function createServerSupabase(
  cookies: { getAll(): { name: string; value: string }[] }
) {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookies.getAll() },
      setAll() {},
    },
  })
}

// Admin client — server-side only, bypasses RLS
export const supabaseAdmin = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
