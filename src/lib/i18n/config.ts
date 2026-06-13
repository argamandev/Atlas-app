// i18n core config — locale list, direction mapping, defaults.
// Pure (no next/headers) so it is safe to import from both server and client.

export const locales = ['en', 'he'] as const
export type Locale = (typeof locales)[number]

export type Direction = 'ltr' | 'rtl'

// English is the default UI language; Hebrew is a flip.
export const defaultLocale: Locale = 'en'

export const localeDirection: Record<Locale, Direction> = {
  en: 'ltr',
  he: 'rtl',
}

// Native-script names, for the language switcher.
export const localeNames: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
}

// Short labels for a compact segmented toggle.
export const localeShortLabels: Record<Locale, string> = {
  en: 'EN',
  he: 'עב',
}

export const LOCALE_COOKIE = 'locale'

export function getDirection(locale: Locale): Direction {
  return localeDirection[locale]
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}
