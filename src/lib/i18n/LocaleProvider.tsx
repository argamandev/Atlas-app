'use client'

import { createContext, useContext, useMemo } from 'react'
import { getDirection, type Direction, type Locale } from './config'
import type { Dictionary } from './dictionaries'

interface I18nValue {
  locale: Locale
  dir: Direction
  dict: Dictionary
  /** Dot-path lookup with graceful fallback, e.g. t('nav.home'). Prefer `dict.nav.home` for type safety. */
  t: (path: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function resolvePath(dict: Dictionary, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), dict)
  return typeof value === 'string' ? value : path
}

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Dictionary
  children: React.ReactNode
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: getDirection(locale),
      dict,
      t: (path: string) => resolvePath(dict, path),
    }),
    [locale, dict]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used within a <LocaleProvider>')
  }
  return value
}
