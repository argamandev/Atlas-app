import 'server-only'
import { cookies } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './config'

// Read the active locale from the cookie in a Server Component / route handler.
// Falls back to the default locale when the cookie is missing or invalid.
export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : defaultLocale
}
