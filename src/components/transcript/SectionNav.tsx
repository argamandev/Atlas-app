'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TranscriptSection } from '@/lib/types'

interface SectionNavProps {
  sections: TranscriptSection[]
}

export function SectionNav({ sections }: SectionNavProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )

    for (const section of sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sections])

  function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <nav className="sticky top-6 self-start">
      <p className="text-xs text-muted uppercase tracking-wide mb-3 font-semibold">ניווט</p>
      <div className="space-y-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollTo(section.id)}
            className={cn(
              'w-full flex items-center gap-2.5 text-right px-3 py-2.5 rounded text-sm transition-colors',
              activeId === section.id
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            )}
          >
            <span className={cn(
              'w-0.5 h-4 rounded-full flex-shrink-0 transition-colors',
              activeId === section.id ? 'bg-accent' : 'bg-border'
            )} />
            {section.title}
          </button>
        ))}
      </div>

      {/* Line count */}
      <div className="mt-5 pt-4 border-t border-border">
        {sections.map((section) => (
          <div key={section.id} className="flex justify-between items-center py-1">
            <span className="text-xs text-muted">{section.title}</span>
            <span className="text-xs text-muted" dir="ltr">
              {section.lines.length} שורות
            </span>
          </div>
        ))}
      </div>
    </nav>
  )
}
