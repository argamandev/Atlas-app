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
// Explicit no-store fetch prevents Next.js data cache from serving stale rows
export const supabaseAdmin = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }),
    },
  }
)
