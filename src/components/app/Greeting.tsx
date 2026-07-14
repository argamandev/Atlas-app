'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { greetingKey, type GreetingKey } from '@/lib/i18n/format'

// Time-based greeting (brief §5.1) — computed on the client from the user's local time.
// The design greets with a clean first name ("Good morning, Sagi") — raw usernames like
// "sagi.arg" reduce to their first segment, capitalized.
function displayName(raw: string): string {
  const first = raw.split(/[.@_\s]/)[0] || raw
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function Greeting({ name, className }: { name?: string; className?: string }) {
  const { dict } = useI18n()
  const [key, setKey] = useState<GreetingKey>('morning')

  useEffect(() => {
    setKey(greetingKey())
  }, [])

  const hello = dict.greeting[key]
  return <h1 className={className}>{name ? `${hello}, ${displayName(name)}` : hello}</h1>
}
