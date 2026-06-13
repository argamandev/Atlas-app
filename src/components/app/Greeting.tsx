'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { greetingKey, type GreetingKey } from '@/lib/i18n/format'

// Time-based greeting (brief §5.1) — computed on the client from the user's local time.
export function Greeting({ name, className }: { name?: string; className?: string }) {
  const { dict } = useI18n()
  const [key, setKey] = useState<GreetingKey>('morning')

  useEffect(() => {
    setKey(greetingKey())
  }, [])

  const hello = dict.greeting[key]
  return <h1 className={className}>{name ? `${hello}, ${name}` : hello}</h1>
}
