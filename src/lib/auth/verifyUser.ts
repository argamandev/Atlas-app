type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null }
      error: { message: string } | null
    }>
  }
}

/**
 * Resolve the request's user by REVALIDATING the access token with Supabase.
 *
 * Deliberately does not touch `getSession()`: in auth-js 2.105.4 that reads the
 * session straight out of the cookie — a shape check plus an `expires_at` the
 * cookie itself supplies. No signature check, no network call. Because the API
 * routes then query with the service-role client (which bypasses RLS), a forged
 * cookie carrying a known user UUID was enough to read another user's rows.
 * `src/middleware.ts` has always used `getUser()`; this brings the API in line.
 *
 * Returns null rather than throwing, so callers keep their existing 401 paths.
 */
export async function resolveUser(
  supabase: AuthClient
): Promise<{ id: string; email: string | null } | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return { id: data.user.id, email: data.user.email ?? null }
  } catch {
    return null
  }
}
