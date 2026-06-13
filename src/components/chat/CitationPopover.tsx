'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Surface } from '@/components/ds/Surface'
import { ChevronRightIcon } from '@/components/ds/icons'
import type { ChatSource } from '@/lib/api/chat'

// Source chip + floating citation card (brief §5.3 reference). Marks an answer as
// grounded in a specific transcript and links to it.
export function CitationChip({ source }: { source: ChatSource }) {
  const { dict } = useI18n()
  return (
    <div className="group relative mt-2 inline-block">
      <Link
        href={`/app/live/${source.transcriptId}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <span className="font-medium">{source.company}</span>
        <span className="text-ink-faint">· {source.quarter}</span>
        <ChevronRightIcon size={13} />
      </Link>
      <div className="pointer-events-none absolute bottom-full start-0 z-50 mb-2 hidden w-72 group-hover:block">
        <Surface elevation="popover" className="pointer-events-auto p-3 text-start">
          <div className="text-xs font-medium text-ink-faint">{dict.chat.source}</div>
          <p className="mt-1 text-sm text-ink">
            {dict.chat.subhead}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-subtle px-2 py-0.5 text-xs text-ink-muted">
            <span className="font-medium">{source.company}</span>
            <span className="text-ink-faint">· {source.quarter}</span>
          </div>
        </Surface>
      </div>
    </div>
  )
}
