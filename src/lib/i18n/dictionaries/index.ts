import type { Locale } from '../config'
import { en, type Dictionary } from './en'
import { he } from './he'

export type { Dictionary }

const dictionaries: Record<Locale, Dictionary> = { en, he }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
