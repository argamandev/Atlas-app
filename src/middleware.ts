import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requiresAuth, resolveOrigin, loginRedirectTarget } from '@/lib/auth/gate'

// THE LOGIN GATE. Before this existed the API routes were auth-gated but the PAGES were not:
// typing /app/home walked you into the app, and /print/[id] server-rendered a whole transcript
// to anyone holding the URL. Decision logic lives in lib/auth/gate.ts (unit-tested); this file
// is the thin runtime shell.
//
// Deliberately does NOT import '@/lib/supabase' — that module instantiates the SERVICE-ROLE
// admin client at module scope, which must never be pulled into middleware.

export async function middleware(request: NextRequest) {
  // `response` is reassigned by setAll() below so refreshed auth cookies survive the round trip;
  // without that, a user whose token refreshes mid-session gets silently signed out.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser(), NOT getSession(): getSession trusts the cookie as-is, and a cookie is attacker-
  // controlled. getUser revalidates the token with Supabase, which is what makes this a gate
  // rather than a suggestion.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && requiresAuth(request.nextUrl.pathname)) {
    const origin = resolveOrigin(request.headers, request.nextUrl.origin)
    const target = loginRedirectTarget(request.nextUrl.pathname, request.nextUrl.search)
    return NextResponse.redirect(new URL(target, origin))
  }

  return response
}

export const config = {
  // Keep in sync with GATED_PREFIXES in lib/auth/gate.ts. Scoped to the gated trees so the
  // middleware never runs on static assets, the login page, or /auth/callback.
  matcher: ['/app/:path*', '/print/:path*'],
}
